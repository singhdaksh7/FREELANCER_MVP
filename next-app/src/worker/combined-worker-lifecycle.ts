/**
 * Graceful-shutdown wiring for the combined worker, factored out for unit
 * testing (see combined-worker-loop.ts / combined-worker-server.ts for
 * the same rationale). Idempotent — a second SIGTERM/SIGINT during
 * shutdown is a no-op, not a double-close/double-disconnect.
 */

export interface ShutdownDeps {
  closeServer: () => Promise<void>;
  disconnectPrisma: () => Promise<void>;
  /** Interrupts the worker loop's idle wait, if any, so it observes shutdown promptly instead of waiting out the full poll interval. */
  wake: () => void;
  exit: (code: number) => void;
  log?: (message: string) => void;
}

export interface Shutdown {
  shutdown: () => Promise<void>;
  isShuttingDown: () => boolean;
}

export function createShutdown(deps: ShutdownDeps): Shutdown {
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.log?.("[combined-worker] Shutting down…");

    deps.wake();
    await deps.closeServer();
    await deps.disconnectPrisma();

    deps.log?.("[combined-worker] Shutdown complete.");
    deps.exit(0);
  }

  return { shutdown, isShuttingDown: () => shuttingDown };
}
