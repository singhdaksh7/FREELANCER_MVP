import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { wakeWorker, prewarmCombinedWorkerForLogin } from "./worker-wake";

const originalUrl = process.env.WORKER_WAKE_URL;
const originalSecret = process.env.WORKER_WAKE_SECRET;
const originalFetch = global.fetch;

// The fallback retry schedule's cumulative delays: 5s, 10s, 15s, 25s, 35s, 45s, 60s.
const ALL_DELAYS_MS = [5_000, 5_000, 5_000, 10_000, 10_000, 10_000, 15_000];
const TOTAL_SCHEDULE_MS = ALL_DELAYS_MS.reduce((a, b) => a + b, 0);
const HEALTH_BOOTSTRAP_TIMEOUT_MS = 55_000;

function okResponse() {
  return new Response(null, { status: 202 });
}
function healthOkResponse() {
  return new Response(null, { status: 200 });
}
function statusResponse(status: number) {
  return new Response(null, { status });
}

/** A settled wakeWorker() sequence needs a handful of microtask hops before the module is ready for a new sequence. */
async function flushMicrotasks(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

type MockValue = Response | Error;

/**
 * A fetch mock that dispatches to independent queues for the GET /health
 * bootstrap vs. the POST /wake calls, since every wake sequence now tries
 * /health first — mirroring production, where those are genuinely two
 * different requests.
 */
function dispatchingFetch(queues: { health?: MockValue[]; wake?: MockValue[] }) {
  const health = [...(queues.health ?? [])];
  const wake = [...(queues.wake ?? [])];
  return vi.fn(async (_url, init) => {
    const isHealth = (init?.method ?? "GET") === "GET";
    const queue = isHealth ? health : wake;
    const next = queue.shift();
    if (next === undefined) throw new Error("dispatchingFetch: no more mock responses queued for " + (isHealth ? "health" : "wake"));
    if (next instanceof Error) throw next;
    return next;
  });
}

afterEach(() => {
  if (originalUrl === undefined) delete process.env.WORKER_WAKE_URL;
  else process.env.WORKER_WAKE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.WORKER_WAKE_SECRET;
  else process.env.WORKER_WAKE_SECRET = originalSecret;
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  process.env.WORKER_WAKE_URL = "https://worker.example/wake";
  process.env.WORKER_WAKE_SECRET = "top-secret-value";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("wakeWorker", () => {
  it("is a no-op (never calls fetch) when WORKER_WAKE_URL is unset", () => {
    delete process.env.WORKER_WAKE_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => wakeWorker("file")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op (never calls fetch) when WORKER_WAKE_SECRET is unset", () => {
    delete process.env.WORKER_WAKE_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => wakeWorker("delivery")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("health 200 -> wake 202 succeeds via the bootstrap path (fast path when already warm)", async () => {
    const fetchMock = dispatchingFetch({ health: [healthOkResponse()], wake: [okResponse()] });
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [healthUrl, healthInit] = fetchMock.mock.calls[0]!;
    expect(healthUrl).toBe("https://worker.example/health");
    expect(healthInit.method).toBe("GET");

    const [wakeUrl, wakeInit] = fetchMock.mock.calls[1]!;
    expect(wakeUrl).toBe("https://worker.example/wake");
    expect(wakeInit.method).toBe("POST");
    expect(wakeInit.headers["X-Worker-Wake-Secret"]).toBe("top-secret-value");
    expect(String(wakeInit.body)).not.toContain("top-secret-value");
  });

  it("bounds the health bootstrap and the wake request with timeout signals", async () => {
    const fetchMock = dispatchingFetch({ health: [healthOkResponse()], wake: [okResponse()] });
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    await flushMicrotasks();

    const [, healthInit] = fetchMock.mock.calls[0]!;
    expect(healthInit.signal).toBeInstanceOf(AbortSignal);
    const [, wakeInit] = fetchMock.mock.calls[1]!;
    expect(wakeInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("health takes 35s to respond, then 200 -> wake 202 succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) => {
        if ((init?.method ?? "GET") === "GET") {
          await new Promise((resolve) => setTimeout(resolve, 35_000));
          return healthOkResponse();
        }
        return okResponse();
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(40_000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a health bootstrap that never resolves in time falls back to the POST /wake retry sequence, which then succeeds", async () => {
    vi.useFakeTimers();
    try {
      // Simulates the bootstrap's own timeout firing (rather than racing
      // the real AbortSignal.timeout implementation, which fake timers
      // don't drive) — the important behavior under test is "the health
      // call doesn't resolve successfully -> fall back", not the exact
      // timer mechanics, which the "bounds ... with timeout signals" test
      // already covers.
      const fetchMock = dispatchingFetch({
        health: [new Error("health bootstrap timed out")],
        wake: [okResponse()],
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(HEALTH_BOOTSTRAP_TIMEOUT_MS + 1_000);

      expect(fetchMock).toHaveBeenCalledTimes(2); // 1 health (failed) + 1 wake (succeeded on the fallback loop's first attempt)
    } finally {
      vi.useRealTimers();
    }
  });

  it("health 502 falls back to the retry loop, which succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = dispatchingFetch({ health: [statusResponse(502)], wake: [okResponse()] });
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("health 200 -> wake 401 is a permanent authenticated failure and stops immediately (no fallback retry)", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = dispatchingFetch({ health: [healthOkResponse()], wake: [statusResponse(401)] });
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      // 1 health + 1 wake — never retries after a real authenticated rejection.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces two overlapping wakeWorker calls into one bootstrap sequence instead of two", async () => {
    const fetchMock = dispatchingFetch({ health: [healthOkResponse()], wake: [okResponse()] });
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    wakeWorker("delivery");
    await flushMicrotasks();

    // Only one health check and one wake go out, even though two callers asked.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh sequence once the previous one has finished", async () => {
    const fetchMock = dispatchingFetch({ health: [healthOkResponse(), healthOkResponse()], wake: [okResponse(), okResponse()] });
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    wakeWorker("file");
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  describe("fallback POST /wake retry loop (health bootstrap unavailable)", () => {
    // These exercise runPostWakeRetryLoop directly by making the health
    // bootstrap fail on its very first call, same as "health 502 falls
    // back" above, then queuing further behavior on the wake queue.

    it("502 -> 502 -> 202 succeeds after riding out two cold-start rejections", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({
          health: [statusResponse(502)],
          wake: [statusResponse(502), statusResponse(502), okResponse()],
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(4); // 1 health + 3 wake attempts
      } finally {
        vi.useRealTimers();
      }
    });

    it("429 -> 502 -> 202 succeeds — a cold worker's Render edge throttling is transient, not permanent", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({
          health: [statusResponse(502)],
          wake: [statusResponse(429), statusResponse(502), okResponse()],
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });

    it("repeated 429 then 202 succeeds", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({
          health: [statusResponse(502)],
          wake: [statusResponse(429), statusResponse(429), statusResponse(429), okResponse()],
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(5);
      } finally {
        vi.useRealTimers();
      }
    });

    it("exits cleanly after exhausting the retry budget on repeated 429s", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({
          health: [statusResponse(502)],
          wake: Array.from({ length: ALL_DELAYS_MS.length + 1 }, () => statusResponse(429)),
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        const errorSpy = vi.spyOn(console, "error");

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(ALL_DELAYS_MS.length + 2); // 1 health + N wake attempts
        expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("wake_exhausted"))).toBe(true);

        fetchMock.mockClear();
        await vi.advanceTimersByTimeAsync(120_000);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a network error -> 202 succeeds (treated the same as a transient status)", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({
          health: [statusResponse(502)],
          wake: [new Error("connection reset mid cold-start"), okResponse()],
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops immediately on 401 — no amount of retrying fixes a bad secret", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({ health: [statusResponse(502)], wake: [statusResponse(401)] });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(2); // 1 health + 1 wake attempt, no retry
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops immediately on 403", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({ health: [statusResponse(502)], wake: [statusResponse(403)] });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops on a permanent 4xx like 400", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({ health: [statusResponse(502)], wake: [statusResponse(400)] });
        global.fetch = fetchMock as unknown as typeof fetch;

        wakeWorker("file");
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("never throws and never logs the secret, even when every attempt fails", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = dispatchingFetch({
          health: [statusResponse(502)],
          wake: Array.from({ length: ALL_DELAYS_MS.length + 1 }, () => new Error("network down")),
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        const errorSpy = vi.spyOn(console, "error");

        expect(() => wakeWorker("delivery")).not.toThrow();
        await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

        expect(errorSpy).toHaveBeenCalled();
        const loggedText = errorSpy.mock.calls.map((c) => JSON.stringify(c)).join(" ");
        expect(loggedText).not.toContain("top-secret-value");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("prewarmCombinedWorkerForLogin", () => {
  it("is a no-op (never calls fetch) when WORKER_WAKE_URL/SECRET are unset", () => {
    delete process.env.WORKER_WAKE_URL;
    delete process.env.WORKER_WAKE_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => prewarmCombinedWorkerForLogin("10.10.0.10")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a wake ping (kind: login) for a fresh IP, never exposing the wake secret in the body", async () => {
    const fetchMock = dispatchingFetch({ health: [healthOkResponse()], wake: [okResponse()] });
    global.fetch = fetchMock as unknown as typeof fetch;

    prewarmCombinedWorkerForLogin("10.20.0.20");
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, wakeInit] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(wakeInit.body))).toEqual({ kind: "login" });
    expect(wakeInit.headers["X-Worker-Wake-Secret"]).toBe("top-secret-value");
    expect(String(wakeInit.body)).not.toContain("top-secret-value");
  });

  it("throttles repeated calls from the same network-scoped IP, but not a different one", async () => {
    const fetchMock = dispatchingFetch({
      health: [healthOkResponse(), healthOkResponse()],
      wake: [okResponse(), okResponse()],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    prewarmCombinedWorkerForLogin("10.30.0.30");
    await flushMicrotasks();
    prewarmCombinedWorkerForLogin("10.30.0.31"); // same /24 network
    prewarmCombinedWorkerForLogin("10.30.0.30");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    prewarmCombinedWorkerForLogin("10.31.0.99"); // different network
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("never throws even when the underlying fetch rejects", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = dispatchingFetch({
        health: [statusResponse(502)],
        wake: Array.from({ length: ALL_DELAYS_MS.length + 1 }, () => new Error("network down")),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      expect(() => prewarmCombinedWorkerForLogin("10.40.0.40")).not.toThrow();
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);
    } finally {
      vi.useRealTimers();
    }
  });
});
