import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "./combined-worker-lifecycle";

describe("createShutdown", () => {
  it("wakes the loop, closes the server, disconnects prisma, then exits — in that order", async () => {
    const calls: string[] = [];
    const { shutdown } = createShutdown({
      wake: () => calls.push("wake"),
      closeServer: async () => {
        calls.push("closeServer");
      },
      disconnectPrisma: async () => {
        calls.push("disconnectPrisma");
      },
      exit: (code) => calls.push(`exit:${code}`),
    });

    await shutdown();

    expect(calls).toEqual(["wake", "closeServer", "disconnectPrisma", "exit:0"]);
  });

  it("is idempotent — a second call is a no-op and does not close/disconnect twice", async () => {
    const closeServer = vi.fn(async () => {});
    const disconnectPrisma = vi.fn(async () => {});
    const exit = vi.fn();
    const { shutdown } = createShutdown({ wake: () => {}, closeServer, disconnectPrisma, exit });

    await shutdown();
    await shutdown();

    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(disconnectPrisma).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("concurrent shutdown calls (e.g. SIGTERM racing a crash handler) still only close/disconnect once", async () => {
    let closeServerCalls = 0;
    const { shutdown } = createShutdown({
      wake: () => {},
      closeServer: async () => {
        closeServerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
      disconnectPrisma: async () => {},
      exit: () => {},
    });

    await Promise.all([shutdown(), shutdown(), shutdown()]);
    expect(closeServerCalls).toBe(1);
  });

  it("isShuttingDown() flips to true immediately, before closeServer/disconnectPrisma resolve", async () => {
    let observedDuringClose = false;
    const { shutdown, isShuttingDown } = createShutdown({
      wake: () => {},
      closeServer: async () => {
        observedDuringClose = isShuttingDown();
      },
      disconnectPrisma: async () => {},
      exit: () => {},
    });

    expect(isShuttingDown()).toBe(false);
    await shutdown();
    expect(observedDuringClose).toBe(true);
    expect(isShuttingDown()).toBe(true);
  });
});
