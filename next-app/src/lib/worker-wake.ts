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
 * Retry schedule is shaped around production evidence, not guesswork. Two
 * rounds of production testing found:
 *
 *   1. A POST /wake against a sleeping Render Free origin gets a fast HTTP
 *      502 (and sometimes 429 — Render's own edge throttling repeat
 *      requests mid-boot, not the worker app's rate limiter, confirmed by
 *      zero worker-side logs during the window) from Render's edge. Both
 *      are transient cold-start noise, not permanent rejections.
 *   2. Even with that classification fixed and the retry schedule running
 *      its full ~61s budget (8 short, independently-timed-out attempts),
 *      the worker still never woke — while a single lone, patient GET
 *      /health request (no retries, one held-open connection) reliably
 *      completes in ~23-43s. Render's cold start appears to need one
 *      sustained connection that survives the whole boot, not several
 *      short independent probes that each give up and reconnect.
 *
 * So the primary path is now: hold open a patient GET to the worker's
 * public /health (bootstrapHealthThenWake) long enough to cover the
 * observed cold-start window, then — once the worker is confirmed up —
 * send the real authenticated POST /wake. /health is a read-only,
 * unauthenticated status probe (see combined-worker-server.ts): it never
 * claims jobs, mutates the DB, or runs processing, so using it purely as a
 * "is the origin up yet" bootstrap doesn't weaken /wake's own
 * authentication or touch job logic at all.
 *
 * If the bootstrap itself fails or times out (health URL undeterminable,
 * network error, non-2xx), or the authenticated wake after a successful
 * bootstrap comes back with a transient status, this falls back to the
 * short-attempt retry loop below (unchanged from the previous fix, still
 * including 429) as a second line of defense — never a total no-op.
 *
 * Never logs WORKER_WAKE_SECRET or the worker URL, never throws, never
 * awaited-to-failure by callers (fire-and-forget from their point of view
 * — wakeWorker returns void, not a Promise, so nothing can accidentally
 * block on it).
 */
const HEALTH_BOOTSTRAP_TIMEOUT_MS = 55_000;
const WAKE_ATTEMPT_TIMEOUT_MS = 15_000;
// Delays between attempts, landing cumulative elapsed time at roughly
// 5s, 10s, 15s, 25s, 35s, 45s, 60s.
const WAKE_RETRY_DELAYS_MS = [5_000, 5_000, 5_000, 10_000, 10_000, 10_000, 15_000];
// Transient/retryable statuses — see the module doc comment above for why
// 429 belongs here alongside the classic Bad-Gateway-family responses.
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

export type WakeKind = "file" | "delivery" | "login";

/**
 * One in-flight wake sequence per process, shared by every caller (login,
 * register, upload completion, delivery/approval wakes) — the worker is a
 * single process regardless of how many features ask to wake it around
 * the same time, so a second caller joins the sequence already running
 * instead of starting its own parallel ~60s retry storm against the same
 * sleeping origin. Module-scoped, not persisted: losing it on a restart
 * just means the next wakeWorker() call starts a fresh sequence.
 */
let activeWakeSequence: Promise<void> | null = null;

export function wakeWorker(kind: WakeKind, timingCorrelationId?: string): void {
  const url = process.env.WORKER_WAKE_URL;
  const secret = process.env.WORKER_WAKE_SECRET;
  if (!url || !secret) return;
  if (timingCorrelationId) logUploadTiming({ correlationId: timingCorrelationId, stage: "wake_sent" });
  // "login" is the only kind with its own observability tag family (see
  // prewarmCombinedWorkerForLogin below) — the file/delivery kinds already
  // have their own timing logging above and in their callers.
  if (kind === "login") console.log("[worker-prewarm] wake_sent");

  if (activeWakeSequence) {
    console.log(`[worker-wake] wake_sent kind=${kind} (joined in-flight sequence)`);
    return;
  }

  console.log(`[worker-wake] wake_started kind=${kind}`);
  const sequence = runWakeSequence(url, secret, kind);
  activeWakeSequence = sequence;
  void sequence.finally(() => {
    if (activeWakeSequence === sequence) activeWakeSequence = null;
  });
}

type WakeAttemptResult = { ok: true } | { ok: false; status?: number };

async function postWake(url: string, secret: string, kind: WakeKind): Promise<WakeAttemptResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-Worker-Wake-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      signal: AbortSignal.timeout(WAKE_ATTEMPT_TIMEOUT_MS),
    });
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    // Network error or our own per-attempt timeout — indistinguishable
    // from a cold-start connection failure from here, so treated the same
    // as a transient status below (no status to report).
    return { ok: false };
  }
}

/** POST /wake's URL with the path swapped to the worker's public, unauthenticated GET /health — same origin, no separate config needed. Returns null (never throws) if WORKER_WAKE_URL isn't a parseable absolute URL. */
function deriveHealthUrl(wakeUrl: string): string | null {
  try {
    const url = new URL(wakeUrl);
    url.pathname = "/health";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

type BootstrapOutcome = "succeeded" | "permanent" | "fallback";

/**
 * Holds one patient GET open against the worker's public /health — long
 * enough to survive a real Render Free cold start — then, once the origin
 * confirms it's up, sends the real authenticated POST /wake. /health does
 * no auth and no job work (see combined-worker-server.ts), so this never
 * weakens /wake's own secret check and never touches job state; it's
 * purely "is the origin reachable yet."
 */
async function bootstrapHealthThenWake(url: string, secret: string, kind: WakeKind, startedAt: number): Promise<BootstrapOutcome> {
  const healthUrl = deriveHealthUrl(url);
  if (!healthUrl) return "fallback";

  console.log(`[worker-wake] bootstrap_started kind=${kind}`);
  try {
    const response = await fetch(healthUrl, { method: "GET", signal: AbortSignal.timeout(HEALTH_BOOTSTRAP_TIMEOUT_MS) });
    console.log(`[worker-wake] bootstrap_status=${response.status}`);
    if (!response.ok) {
      console.error(`[worker-wake] bootstrap_failed status=${response.status}`);
      return "fallback";
    }
  } catch {
    console.error("[worker-wake] bootstrap_failed status=network_error_or_timeout");
    return "fallback";
  }
  console.log(`[worker-wake] bootstrap_succeeded elapsedMs=${Date.now() - startedAt}`);

  console.log(`[worker-wake] authenticated_wake_started kind=${kind}`);
  const result = await postWake(url, secret, kind);
  if (result.ok) {
    console.log(`[worker-wake] wake_succeeded elapsedMs=${Date.now() - startedAt}`);
    if (kind === "login") console.log("[worker-prewarm] wake_succeeded");
    return "succeeded";
  }

  const transient = result.status === undefined || TRANSIENT_STATUSES.has(result.status);
  if (!transient) {
    console.error(`[worker-wake] wake_aborted status=${result.status}`);
    if (kind === "login") console.log("[worker-prewarm] wake_failed");
    return "permanent";
  }
  // The origin answered /health but the authenticated /wake itself came
  // back transient (rare — e.g. a request landing in the last moment of
  // startup) — the bounded retry loop below picks up from here.
  return "fallback";
}

/** Fallback: the short-attempt, spaced-retry POST /wake loop from the previous fix, unchanged. Used when the health bootstrap can't run or doesn't resolve things on its own. */
async function runPostWakeRetryLoop(url: string, secret: string, kind: WakeKind, startedAt: number): Promise<void> {
  const totalAttempts = WAKE_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const result = await postWake(url, secret, kind);

    if (result.ok) {
      const elapsedMs = Date.now() - startedAt;
      console.log(`[worker-wake] attempt=${attempt} status=202`);
      console.log(`[worker-wake] wake_succeeded elapsedMs=${elapsedMs}`);
      if (kind === "login") console.log("[worker-prewarm] wake_succeeded");
      return;
    }

    console.log(`[worker-wake] attempt=${attempt} status=${result.status ?? "network_error"}`);

    // No status at all (network error / our own timeout) is treated as
    // transient — the same connection failures a genuine cold start
    // produces. A status is only "permanent" when it's present and isn't
    // one of the transient statuses above; that covers 401/403 and any
    // other 4xx/5xx immediately.
    const transient = result.status === undefined || TRANSIENT_STATUSES.has(result.status);
    if (!transient) {
      console.error(`[worker-wake] wake_aborted status=${result.status}`);
      if (kind === "login") console.log("[worker-prewarm] wake_failed");
      return;
    }

    const delay = WAKE_RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) break; // schedule exhausted
    console.log("[worker-wake] retrying");
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const elapsedMs = Date.now() - startedAt;
  console.error(`[worker-wake] wake_exhausted elapsedMs=${elapsedMs}`);
  if (kind === "login") console.log("[worker-prewarm] wake_failed");
}

async function runWakeSequence(url: string, secret: string, kind: WakeKind): Promise<void> {
  const startedAt = Date.now();

  const outcome = await bootstrapHealthThenWake(url, secret, kind, startedAt);
  if (outcome !== "fallback") return;

  await runPostWakeRetryLoop(url, secret, kind, startedAt);
}

/**
 * Per-network-scoped-IP throttle window for prewarmCombinedWorkerForLogin,
 * separate from prewarmFileWorkerAction's per-creator map above — /login
 * runs before authentication, so there is no creator id to key on yet.
 * Module-scoped in-memory state, same "acceptable for a single demo
 * process" reasoning as that map: this is a best-effort optimization, not
 * a source of truth, so losing it on a redeploy/restart has no
 * correctness impact. Independent of the in-flight wake-sequence
 * coalescing above — this throttle prevents *starting* a new sequence too
 * often from the same network; the coalescing prevents *concurrent*
 * sequences once one is already running.
 */
const LOGIN_PREWARM_THROTTLE_MS = 45_000;
const lastLoginPrewarmAtByIp = new Map<string, number>();

/**
 * Best-effort "start warming up" ping fired when the server renders
 * /login (and /register) — earlier than prewarmFileWorkerAction, which
 * needs an authenticated session that doesn't exist yet at that point.
 * Reuses wakeWorker exactly as-is (kind: "login") rather than standing up
 * a second wake path — the worker's /wake endpoint doesn't inspect `kind`
 * at all, so this creates no dummy processing/delivery job.
 *
 * Never throws into the caller: every failure mode (missing env,
 * throttled, fetch rejection) is a silent no-op or a console.log, never a
 * thrown error, so a login page render can call this unconditionally and
 * unawaited without risking its own response. Non-blocking end to end —
 * wakeWorker returns immediately; the retry sequence runs in the
 * background and the caller's request/response is never delayed by it.
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
