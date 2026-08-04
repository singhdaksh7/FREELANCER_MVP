"use server";

import { getAuthenticatedCreator } from "@/data-access/auth";
import { wakeWorker } from "@/lib/worker-wake";

/**
 * Per-creator throttle window for prewarmFileWorkerAction, independent of
 * the UI's own "once per upload batch" gate (src/hooks/use-file-upload-
 * queue.ts) — that gate only protects a well-behaved browser client; this
 * protects the action itself against a script calling it directly and
 * repeatedly. Module-scoped in-memory state is fine here: this action's
 * only effect is a fire-and-forget ping, never a source of truth, so
 * losing it on a redeploy/restart has no correctness impact — same
 * "acceptable for a single demo process" reasoning as the sliding-window
 * limiter in combined-worker-server.ts.
 */
const PREWARM_THROTTLE_MS = 5_000;
const lastPrewarmAtByCreator = new Map<string, number>();

/**
 * Best-effort "start warming up" ping fired from the browser the moment a
 * file upload begins — separate from (and earlier than) the real
 * "job queued" wake that src/data-access/uploads.ts fires once the upload
 * is verified and a FileProcessingJob actually exists. On Render's free
 * tier the worker can be cold-starting for several seconds; firing this as
 * soon as the browser starts its (also multi-second) direct-to-S3 PUT
 * overlaps that cold start with the upload instead of adding it afterward.
 *
 * Requires an authenticated session — never a public, unauthenticated
 * endpoint a caller could hammer to repeatedly wake the worker. Also
 * throttled per creator (see above) so a script calling this action
 * directly and rapidly can't turn it into an amplified request flood
 * against WORKER_WAKE_URL; the worker's own /wake endpoint additionally
 * rate-limits and safely no-ops if it's already awake (see
 * combined-worker-server.ts) — this is defense in depth, not a
 * replacement for that.
 */
export async function prewarmFileWorkerAction(): Promise<void> {
  const creator = await getAuthenticatedCreator();
  if (!creator) return;

  const now = Date.now();
  const lastAt = lastPrewarmAtByCreator.get(creator.id);
  if (lastAt !== undefined && now - lastAt < PREWARM_THROTTLE_MS) return;
  lastPrewarmAtByCreator.set(creator.id, now);

  wakeWorker("file");
}
