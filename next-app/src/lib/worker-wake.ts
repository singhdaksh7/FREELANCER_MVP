import "server-only";

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

export function wakeWorker(kind: "file" | "delivery"): void {
  const url = process.env.WORKER_WAKE_URL;
  const secret = process.env.WORKER_WAKE_SECRET;
  if (!url || !secret) return;

  void attemptWake(url, secret, kind, WAKE_MAX_ATTEMPTS);
}

async function attemptWake(url: string, secret: string, kind: "file" | "delivery", attemptsLeft: number): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-Worker-Wake-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    if (!response.ok && attemptsLeft > 1) {
      await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAY_MS));
      await attemptWake(url, secret, kind, attemptsLeft - 1);
    }
  } catch (error) {
    if (attemptsLeft > 1) {
      await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAY_MS));
      await attemptWake(url, secret, kind, attemptsLeft - 1);
      return;
    }
    console.error(`[worker-wake] Failed to wake worker for "${kind}" job (non-fatal):`, error instanceof Error ? error.message : error);
  }
}
