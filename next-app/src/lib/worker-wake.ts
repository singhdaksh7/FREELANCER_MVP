import "server-only";
import { logUploadTiming } from "./upload-timing";
import { networkScopedIp } from "./rate-limit";

/**
 * Best-effort "wake up and poll now" ping to the combined demo worker's
 * POST /wake (see src/worker/combined-worker.ts) — Render Free has no
 * background-worker plan, only Web Services, so the worker sits behind
 * its own polling loop and this just shortens the wait after a job is
 * actually queued. Entirely optional: WORKER_WAKE_URL is unset in every
 * non-demo environment, and a failed/slow wake never fails the caller's
 * mutation — the worker's own poll loop will pick the job up regardless
 * once it's running.
 *
 * Timeout/retry are deliberately generous, not a quick best-effort blip:
 * a Render free-tier Web Service that has spun down after inactivity can
 * take 30-60+ seconds to cold-start on its next inbound request, and this
 * wake ping is exactly that triggering request. The original 1.5s abort
 * was proven in production to be far shorter than a real cold start, so
 * the ping's own connection was torn down before the worker ever came up
 * — leaving an uploaded file's processing job sitting PENDING with
 * nothing left to wake the worker until an unrelated request happened to
 * hit it. One retry covers a connection dropped mid-boot.
 *
 * Never logs WORKER_WAKE_SECRET, never throws, never awaited-to-failure by
 * callers (fire-and-forget from their point of view).
 */
const WAKE_TIMEOUT_MS = 45_000;
const WAKE_RETRY_DELAY_MS = 5_000;
const WAKE_MAX_ATTEMPTS = 2;

export type WakeKind = "file" | "delivery" | "login";

export function wakeWorker(kind: WakeKind, timingCorrelationId?: string): void {
  const url = process.env.WORKER_WAKE_URL;
  const secret = process.env.WORKER_WAKE_SECRET;
  if (!url || !secret) return;
  if (timingCorrelationId) logUploadTiming({ correlationId: timingCorrelationId, stage: "wake_sent" });
  // "login" is the only kind with its own observability tag family (see
  // prewarmCombinedWorkerForLogin below) — the file/delivery kinds already
  // have their own timing/error logging above and in their callers.
  if (kind === "login") console.log("[worker-prewarm] wake_sent");

  void attemptWake(url, secret, kind, WAKE_MAX_ATTEMPTS);
}

async function attemptWake(url: string, secret: string, kind: WakeKind, attemptsLeft: number): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-Worker-Wake-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (attemptsLeft > 1) {
        await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAY_MS));
        await attemptWake(url, secret, kind, attemptsLeft - 1);
        return;
      }
      // Every attempt exhausted with a non-2xx response (as opposed to a
      // thrown/network error, handled below) previously fell through here
      // silently for "file"/"delivery" kinds — a real wake failure (e.g. a
      // wake-secret mismatch, or the worker rejecting the request) left no
      // trace at all, so a job could sit PENDING indefinitely with nothing
      // in the logs to explain why. Always log the final status so this is
      // never silent again.
      console.error(`[worker-wake] Wake for "${kind}" job rejected (non-fatal): HTTP ${response.status}`);
      if (kind === "login") console.log("[worker-prewarm] wake_failed");
      return;
    }
    if (kind === "login") console.log("[worker-prewarm] wake_succeeded");
  } catch (error) {
    if (attemptsLeft > 1) {
      await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAY_MS));
      await attemptWake(url, secret, kind, attemptsLeft - 1);
      return;
    }
    console.error(`[worker-wake] Failed to wake worker for "${kind}" job (non-fatal):`, error instanceof Error ? error.message : error);
    if (kind === "login") console.log("[worker-prewarm] wake_failed");
  }
}

/**
 * Per-network-scoped-IP throttle window for prewarmCombinedWorkerForLogin,
 * separate from prewarmFileWorkerAction's per-creator map above — /login
 * runs before authentication, so there is no creator id to key on yet.
 * Module-scoped in-memory state, same "acceptable for a single demo
 * process" reasoning as that map: this is a best-effort optimization, not
 * a source of truth, so losing it on a redeploy/restart has no
 * correctness impact.
 */
const LOGIN_PREWARM_THROTTLE_MS = 45_000;
const lastLoginPrewarmAtByIp = new Map<string, number>();

/**
 * Best-effort "start warming up" ping fired when the server renders
 * /login (and /register) — earlier than prewarmFileWorkerAction, which
 * needs an authenticated session that doesn't exist yet at that point.
 * Reuses wakeWorker/attemptWake exactly as-is (kind: "login") rather than
 * standing up a second wake path — the worker's /wake endpoint doesn't
 * inspect `kind` at all, so this creates no dummy processing/delivery job.
 *
 * Never throws into the caller: every failure mode (missing env, throttled,
 * fetch rejection) is a silent no-op or a console.log, never a thrown
 * error, so a login page render can call this unconditionally and
 * unawaited without risking its own response.
 */
export function prewarmCombinedWorkerForLogin(ip: string): void {
  if (!process.env.WORKER_WAKE_URL || !process.env.WORKER_WAKE_SECRET) return;

  const scopedIp = networkScopedIp(ip);
  const now = Date.now();
  const lastAt = lastLoginPrewarmAtByIp.get(scopedIp);
  if (lastAt !== undefined && now - lastAt < LOGIN_PREWARM_THROTTLE_MS) return;
  lastLoginPrewarmAtByIp.set(scopedIp, now);

  console.log("[worker-prewarm] login_page_triggered");
  wakeWorker("login");
}
