import { describe, expect, it, vi } from "vitest";
import {
  escapeAttributeValue,
  normalizeStatus,
  pollForStatus,
  type FileStatusLabel,
  type PollForStatusDeps,
  type PollForStatusOptions,
} from "./e2e-file-status";

/** Deterministic fake clock: `sleep` and reload both advance it directly — no real timers, so these tests run instantly regardless of the 90s production timeout. */
function createFakeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

const BASE_OPTIONS: PollForStatusOptions = {
  expectedStatus: "Ready",
  timeoutMs: 90_000,
  gracePeriodMs: 15_000,
  reloadCooldownMs: 8_000,
  intervalsMs: [500, 1000, 1500, 2500, 5000],
  historyLimit: 40,
};

describe("normalizeStatus", () => {
  it("passes through a known status label unchanged", () => {
    expect(normalizeStatus("Ready")).toBe("Ready");
    expect(normalizeStatus("Processing")).toBe("Processing");
  });

  it("normalizes internal/surrounding whitespace", () => {
    expect(normalizeStatus("  Ready  ")).toBe("Ready");
    expect(normalizeStatus("Rea\n dy")).toBe(null); // not a real label once collapsed — guards against false positives
    expect(normalizeStatus("Up   loaded")).toBe(null);
  });

  it("returns null for unknown text, empty string, null, or undefined", () => {
    expect(normalizeStatus("Some Unrelated Text")).toBe(null);
    expect(normalizeStatus("")).toBe(null);
    expect(normalizeStatus(null)).toBe(null);
    expect(normalizeStatus(undefined)).toBe(null);
  });
});

describe("escapeAttributeValue", () => {
  it("escapes backslashes and double quotes for a CSS attribute selector", () => {
    expect(escapeAttributeValue('weird"file.jpg')).toBe('weird\\"file.jpg');
    expect(escapeAttributeValue("back\\slash.jpg")).toBe("back\\\\slash.jpg");
  });

  it("leaves ordinary filenames untouched", () => {
    expect(escapeAttributeValue("review-file-one-12345.jpg")).toBe("review-file-one-12345.jpg");
  });
});

describe("pollForStatus", () => {
  function makeSequenceReader(sequence: (FileStatusLabel | null)[]) {
    let i = 0;
    const calls: (FileStatusLabel | null)[] = [];
    return {
      read: async (): Promise<FileStatusLabel | null> => {
        const value = sequence[Math.min(i, sequence.length - 1)];
        i += 1;
        calls.push(value);
        return value;
      },
      calls,
    };
  }

  it("Processing → Ready succeeds", async () => {
    const reader = makeSequenceReader(["Processing", "Ready"]);
    const clock = createFakeClock();
    const reloadAndResync = vi.fn(async () => {});

    const result = await pollForStatus(
      { readStatus: reader.read, reloadAndResync, sleep: clock.sleep, now: clock.now },
      BASE_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.finalStatus).toBe("Ready");
    expect(result.recoveredOnFinalRead).toBe(false);
    expect(reloadAndResync).not.toHaveBeenCalled();
  });

  it("Uploaded → Processing → Ready succeeds", async () => {
    const reader = makeSequenceReader(["Uploaded", "Processing", "Ready"]);
    const clock = createFakeClock();

    const result = await pollForStatus(
      { readStatus: reader.read, reloadAndResync: async () => {}, sleep: clock.sleep, now: clock.now },
      BASE_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.finalStatus).toBe("Ready");
    expect(reader.calls).toEqual(["Uploaded", "Processing", "Ready"]);
  });

  it("status becomes Ready immediately after reload", async () => {
    const clock = createFakeClock();
    let reloaded = false;
    const readStatus = vi.fn(async (): Promise<FileStatusLabel | null> => (reloaded ? "Ready" : "Processing"));
    const reloadAndResync = vi.fn(async () => {
      reloaded = true;
      clock.advance(50); // reload+resync itself takes a little real time
    });

    const result = await pollForStatus(
      { readStatus, reloadAndResync, sleep: clock.sleep, now: clock.now },
      BASE_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.finalStatus).toBe("Ready");
    expect(result.recoveredOnFinalRead).toBe(false); // resolved by the loop itself, not the timeout-boundary rescue
    expect(reloadAndResync).toHaveBeenCalledTimes(1);
    // The read that produced the final result must have happened after
    // reloadAndResync resolved — never a value captured before the reload.
    expect(readStatus.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      reloadAndResync.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("card is temporarily absent after reload, then appears Ready", async () => {
    const clock = createFakeClock();
    let phase: "before-reload" | "absent" | "ready" = "before-reload";
    let absentReadsRemaining = 2;
    const readStatus = async (): Promise<FileStatusLabel | null> => {
      if (phase === "before-reload") return "Processing";
      if (phase === "absent") {
        absentReadsRemaining -= 1;
        if (absentReadsRemaining <= 0) phase = "ready";
        return null; // card not rendered yet
      }
      return "Ready";
    };
    const reloadAndResync = async () => {
      phase = "absent";
      clock.advance(50);
    };

    const result = await pollForStatus(
      { readStatus, reloadAndResync, sleep: clock.sleep, now: clock.now },
      BASE_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.finalStatus).toBe("Ready");
    // The bounded history should show at least one `null` (absent) entry
    // between the pre-reload and post-reload statuses.
    expect(result.history.some((entry) => entry.status === null)).toBe(true);
  });

  it("stale pre-reload value is not reused after a reload", async () => {
    const clock = createFakeClock();
    // Simulates a completely new DOM element after reload — if the loop
    // ever reused a value captured before reloadAndResync resolved, it
    // would still see "Processing" here.
    let sourceOfTruth: FileStatusLabel | null = "Processing";
    const readStatus = async () => sourceOfTruth;
    const reloadAndResync = async () => {
      sourceOfTruth = "Ready";
      clock.advance(50);
    };

    const result = await pollForStatus(
      { readStatus, reloadAndResync, sleep: clock.sleep, now: clock.now },
      BASE_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.history.at(-1)?.status).toBe("Ready");
  });

  it("final fresh read is Ready after poll timeout and returns success", async () => {
    const clock = createFakeClock();
    let callCount = 0;
    const readStatus = async (): Promise<FileStatusLabel | null> => {
      callCount += 1;
      // First two reads (initial + right at the timeout boundary) are
      // still "Processing"; the third — the final-race protection read —
      // is "Ready", reproducing the confirmed defect exactly.
      return callCount <= 2 ? "Processing" : "Ready";
    };

    const options: PollForStatusOptions = {
      ...BASE_OPTIONS,
      timeoutMs: 1_000,
      gracePeriodMs: 999_999, // never reload in this test — isolate the final-race path
      intervalsMs: [2_000],
    };

    const result = await pollForStatus(
      { readStatus, reloadAndResync: async () => {}, sleep: clock.sleep, now: clock.now },
      options,
    );

    expect(result.success).toBe(true);
    expect(result.finalStatus).toBe("Ready");
    expect(result.recoveredOnFinalRead).toBe(true);
    expect(callCount).toBe(3);
  });

  it("Failed while expecting Ready fails early, without waiting for a reload", async () => {
    const clock = createFakeClock();
    const readStatus = async (): Promise<FileStatusLabel | null> => "Failed";
    const reloadAndResync = vi.fn(async () => {});

    const result = await pollForStatus(
      { readStatus, reloadAndResync, sleep: clock.sleep, now: clock.now },
      BASE_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.failedEarly).toBe(true);
    expect(result.finalStatus).toBe("Failed");
    expect(reloadAndResync).not.toHaveBeenCalled();
  });

  it("genuinely stuck Processing still times out", async () => {
    const clock = createFakeClock();
    const readStatus = async (): Promise<FileStatusLabel | null> => "Processing";

    const options: PollForStatusOptions = { ...BASE_OPTIONS, timeoutMs: 2_000, gracePeriodMs: 999_999 };
    const result = await pollForStatus(
      { readStatus, reloadAndResync: async () => {}, sleep: clock.sleep, now: clock.now },
      options,
    );

    expect(result.success).toBe(false);
    expect(result.finalStatus).toBe("Processing");
    expect(result.failedEarly).toBe(false);
    expect(result.recoveredOnFinalRead).toBe(false);
  });

  it("keeps the observation history bounded", async () => {
    const clock = createFakeClock();
    const readStatus = async (): Promise<FileStatusLabel | null> => "Processing";
    const options: PollForStatusOptions = {
      ...BASE_OPTIONS,
      timeoutMs: 5_000,
      gracePeriodMs: 999_999,
      intervalsMs: [200],
      historyLimit: 3,
    };

    const result = await pollForStatus(
      { readStatus, reloadAndResync: async () => {}, sleep: clock.sleep, now: clock.now },
      options,
    );

    expect(result.history.length).toBeLessThanOrEqual(3);
    // The retained entries are the most recent ones, in order.
    const atMsValues = result.history.map((entry) => entry.atMs);
    expect(atMsValues).toEqual([...atMsValues].sort((a, b) => a - b));
  });

  it("only the matching file card drives the result, even when another card already says Ready", async () => {
    const clock = createFakeClock();
    const cards: Record<string, FileStatusLabel> = {
      "review-file-one.jpg": "Processing",
      "review-file-two.jpg": "Ready",
    };
    // Scoped exactly like the real Playwright wrapper scopes its Locator
    // to a single `[data-file-name="..."]` card — this reader only ever
    // looks at "review-file-one.jpg", regardless of file-two's status.
    const readStatus = async (): Promise<FileStatusLabel | null> => cards["review-file-one.jpg"];
    const reloadAndResync = async () => {
      cards["review-file-one.jpg"] = "Ready";
      clock.advance(50);
    };

    const deps: PollForStatusDeps = { readStatus, reloadAndResync, sleep: clock.sleep, now: clock.now };
    const result = await pollForStatus(deps, BASE_OPTIONS);

    expect(result.success).toBe(true);
    // It took an actual state change (via reload) for file-one to reach
    // Ready — the poll didn't short-circuit just because file-two was
    // already Ready from the very first read.
    expect(result.history[0]?.status).toBe("Processing");
    expect(result.history.at(-1)?.status).toBe("Ready");
  });
});
