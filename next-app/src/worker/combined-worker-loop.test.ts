import { describe, expect, it, vi } from "vitest";
import { runCombinedLoop, createInterruptibleWait } from "./combined-worker-loop";

describe("runCombinedLoop", () => {
  it("checks for a file-processing job before a delivery job on every pass", async () => {
    const order: string[] = [];
    let calls = 0;

    await runCombinedLoop({
      claimNextFileJob: async () => {
        order.push("claim-file");
        return null;
      },
      processFileJob: async () => {},
      claimNextDeliveryJob: async () => {
        order.push("claim-delivery");
        return null;
      },
      processDeliveryJob: async () => {},
      wait: async () => {
        calls += 1;
      },
      pollIntervalMs: 10,
      isShuttingDown: () => calls >= 1,
    });

    expect(order).toEqual(["claim-file", "claim-delivery"]);
  });

  it("processes a claimed file job and skips the delivery claim on that pass", async () => {
    const order: string[] = [];
    let fileCalls = 0;
    let deliveryCalls = 0;

    await runCombinedLoop({
      claimNextFileJob: async () => {
        fileCalls += 1;
        return fileCalls === 1 ? { id: "file-job-1" } : null;
      },
      processFileJob: async (job) => {
        order.push(`process-file:${job.id}`);
      },
      claimNextDeliveryJob: async () => {
        deliveryCalls += 1;
        order.push("claim-delivery");
        return null;
      },
      processDeliveryJob: async () => {},
      wait: async () => {},
      pollIntervalMs: 10,
      isShuttingDown: () => deliveryCalls >= 1,
    });

    // First pass: claims + processes the file job, never reaches the delivery claim.
    // Second pass: no file job, falls through to the delivery claim, then stops.
    expect(order).toEqual(["process-file:file-job-1", "claim-delivery"]);
  });

  it("falls through to a delivery job only when no file job is available", async () => {
    let deliveryProcessed = false;

    await runCombinedLoop({
      claimNextFileJob: async () => null,
      processFileJob: async () => {},
      claimNextDeliveryJob: async () => ({ id: "delivery-job-1" }),
      processDeliveryJob: async (job) => {
        expect(job.id).toBe("delivery-job-1");
        deliveryProcessed = true;
      },
      wait: async () => {},
      pollIntervalMs: 10,
      isShuttingDown: () => deliveryProcessed,
    });

    expect(deliveryProcessed).toBe(true);
  });

  it("waits using the configured poll interval only when neither queue has work", async () => {
    const waitCalls: number[] = [];
    let iterations = 0;

    await runCombinedLoop({
      claimNextFileJob: async () => null,
      claimNextDeliveryJob: async () => null,
      processFileJob: async () => {},
      processDeliveryJob: async () => {},
      wait: async (ms) => {
        waitCalls.push(ms);
        iterations += 1;
      },
      pollIntervalMs: 2000,
      isShuttingDown: () => iterations >= 3,
    });

    expect(waitCalls).toEqual([2000, 2000, 2000]);
  });

  it("never runs a file job and a delivery job concurrently — at most one active job at a time", async () => {
    let active = 0;
    let maxActive = 0;
    let fileCalls = 0;
    let deliveryCalls = 0;
    let shutdownChecks = 0;

    await runCombinedLoop({
      claimNextFileJob: async () => {
        fileCalls += 1;
        return fileCalls === 1 ? { id: "f1" } : null;
      },
      processFileJob: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve(); // yield the microtask queue, same as a real async operation would
        active -= 1;
      },
      claimNextDeliveryJob: async () => {
        deliveryCalls += 1;
        return deliveryCalls === 1 ? { id: "d1" } : null;
      },
      processDeliveryJob: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
      },
      wait: async () => {},
      pollIntervalMs: 10,
      isShuttingDown: () => {
        shutdownChecks += 1;
        return shutdownChecks > 10;
      },
    });

    expect(fileCalls).toBeGreaterThan(0);
    expect(deliveryCalls).toBeGreaterThan(0);
    expect(maxActive).toBe(1);
  });

  it("stops immediately when isShuttingDown is already true, without claiming anything", async () => {
    const claimFile = vi.fn(async () => null);
    const claimDelivery = vi.fn(async () => null);

    await runCombinedLoop({
      claimNextFileJob: claimFile,
      processFileJob: async () => {},
      claimNextDeliveryJob: claimDelivery,
      processDeliveryJob: async () => {},
      wait: async () => {},
      pollIntervalMs: 10,
      isShuttingDown: () => true,
    });

    expect(claimFile).not.toHaveBeenCalled();
    expect(claimDelivery).not.toHaveBeenCalled();
  });
});

describe("createInterruptibleWait", () => {
  it("resolves early when wake() is called instead of waiting the full duration", async () => {
    vi.useFakeTimers();
    try {
      const { wait, wake } = createInterruptibleWait();
      let resolved = false;
      const waitPromise = wait(60_000).then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);

      wake();
      await waitPromise;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("wake() is a safe no-op when no wait is currently pending", () => {
    const { wake } = createInterruptibleWait();
    expect(() => wake()).not.toThrow();
  });

  it("resolves on its own after the timeout when wake() is never called", async () => {
    vi.useFakeTimers();
    try {
      const { wait } = createInterruptibleWait();
      let resolved = false;
      const p = wait(1000).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(1000);
      await p;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
