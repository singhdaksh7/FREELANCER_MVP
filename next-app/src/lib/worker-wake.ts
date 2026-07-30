import "server-only";

/**
 * Best-effort "wake up and poll now" ping to the combined demo worker's
 * POST /wake (see scripts/worker/combined-worker.ts) — Render Free has no
 * background-worker plan, only Web Services, so the worker sits behind
 * its own polling loop and this just shortens the wait after a job is
 * actually queued. Entirely optional: WORKER_WAKE_URL is unset in every
 * non-demo environment, and a failed/slow wake never fails the caller's
 * mutation — the worker's own poll loop will pick the job up regardless.
 *
 * Never logs WORKER_WAKE_SECRET, never throws, never awaited-to-failure by
 * callers (fire-and-forget from their point of view).
 */
export function wakeWorker(kind: "file" | "delivery"): void {
  const url = process.env.WORKER_WAKE_URL;
  const secret = process.env.WORKER_WAKE_SECRET;
  if (!url || !secret) return;

  fetch(url, {
    method: "POST",
    headers: { "X-Worker-Wake-Secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
    signal: AbortSignal.timeout(1500),
  }).catch((error) => {
    console.error(`[worker-wake] Failed to wake worker for "${kind}" job (non-fatal):`, error instanceof Error ? error.message : error);
  });
}
