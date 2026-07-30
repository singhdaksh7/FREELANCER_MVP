/**
 * The combined worker's sequential claim/process loop, factored out of
 * combined-worker.ts so it can be exercised directly by unit tests with
 * mocked claim/process functions (no real Prisma client or database
 * needed) — same rationale as job-processor.ts / delivery-job-processor.ts
 * taking their Prisma client as a parameter instead of importing one.
 *
 * Every pass checks for a file-processing job first, then a delivery job,
 * and awaits whichever one it finds to completion before looping again —
 * this is what guarantees at most one job (of either kind) is ever active
 * at a time in this process.
 */

export interface CombinedLoopDeps<FileJob, DeliveryJob> {
  claimNextFileJob: () => Promise<FileJob | null>;
  processFileJob: (job: FileJob) => Promise<void>;
  claimNextDeliveryJob: () => Promise<DeliveryJob | null>;
  processDeliveryJob: (job: DeliveryJob) => Promise<void>;
  /** Idle-poll wait, interruptible by a wake trigger — see createInterruptibleWait below. */
  wait: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  isShuttingDown: () => boolean;
}

export async function runCombinedLoop<FileJob, DeliveryJob>(
  deps: CombinedLoopDeps<FileJob, DeliveryJob>,
): Promise<void> {
  for (;;) {
    if (deps.isShuttingDown()) return;

    const fileJob = await deps.claimNextFileJob();
    if (fileJob) {
      await deps.processFileJob(fileJob);
      continue;
    }

    if (deps.isShuttingDown()) return;

    const deliveryJob = await deps.claimNextDeliveryJob();
    if (deliveryJob) {
      await deps.processDeliveryJob(deliveryJob);
      continue;
    }

    if (deps.isShuttingDown()) return;
    await deps.wait(deps.pollIntervalMs);
  }
}

export interface InterruptibleWait {
  wait: (ms: number) => Promise<void>;
  /** Resolves the current wait early, if one is in progress; a no-op otherwise. */
  wake: () => void;
}

/** Powers the idle-poll wait that POST /wake shortens — see combined-worker.ts. */
export function createInterruptibleWait(): InterruptibleWait {
  let pendingResolve: (() => void) | null = null;

  return {
    wait(ms: number) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingResolve = null;
          resolve();
        }, ms);
        pendingResolve = () => {
          clearTimeout(timer);
          pendingResolve = null;
          resolve();
        };
      });
    },
    wake() {
      pendingResolve?.();
    },
  };
}
