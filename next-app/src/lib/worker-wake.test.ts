import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { wakeWorker, prewarmCombinedWorkerForLogin } from "./worker-wake";

const originalUrl = process.env.WORKER_WAKE_URL;
const originalSecret = process.env.WORKER_WAKE_SECRET;
const originalFetch = global.fetch;

// The retry schedule's cumulative delays: 5s, 10s, 15s, 25s, 35s, 45s, 60s.
const ALL_DELAYS_MS = [5_000, 5_000, 5_000, 10_000, 10_000, 10_000, 15_000];
const TOTAL_SCHEDULE_MS = ALL_DELAYS_MS.reduce((a, b) => a + b, 0);

function okResponse() {
  return new Response(null, { status: 202 });
}
function statusResponse(status: number) {
  return new Response(null, { status });
}

/** A settled wakeWorker() sequence needs a handful of microtask hops (fetch resolve -> postWake return -> runWakeSequence return -> the .finally() that clears activeWakeSequence) before the module is ready for a new sequence. */
async function flushMicrotasks(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
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

  it("POSTs to WORKER_WAKE_URL with the secret in a header, never in the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://worker.example/wake");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Worker-Wake-Secret"]).toBe("top-secret-value");
    expect(String(init.body)).not.toContain("top-secret-value");
  });

  it("bounds each request with a timeout signal", () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("succeeds on the first attempt with no retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("502 -> 502 -> 202 succeeds after riding out two cold-start rejections", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(statusResponse(502))
        .mockResolvedValueOnce(statusResponse(502))
        .mockResolvedValueOnce(okResponse());
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("503 -> 202 succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValueOnce(statusResponse(503)).mockResolvedValueOnce(okResponse());
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("504 -> 202 succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValueOnce(statusResponse(504)).mockResolvedValueOnce(okResponse());
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a network error -> 202 succeeds (treated the same as a transient status)", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockRejectedValueOnce(new Error("connection reset mid cold-start")).mockResolvedValueOnce(okResponse());
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops immediately on 401 — no amount of retrying fixes a bad secret", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(statusResponse(401));
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops immediately on 403", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(statusResponse(403));
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops on a permanent 4xx like 400", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(statusResponse(400));
      global.fetch = fetchMock as unknown as typeof fetch;

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits cleanly after exhausting the retry budget on repeated 502s — bounded, not infinite", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(statusResponse(502));
      global.fetch = fetchMock as unknown as typeof fetch;
      const errorSpy = vi.spyOn(console, "error");

      wakeWorker("file");
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);

      // 1 initial attempt + one retry per scheduled delay.
      expect(fetchMock).toHaveBeenCalledTimes(ALL_DELAYS_MS.length + 1);
      expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("wake_exhausted"))).toBe(true);

      // Nothing further fires even if more time passes — the loop actually
      // terminated rather than continuing forever.
      fetchMock.mockClear();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never throws and never logs the secret, even when every attempt fails", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
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

  it("coalesces two overlapping wakeWorker calls into one retry sequence instead of two parallel storms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    wakeWorker("delivery");
    await Promise.resolve();
    await Promise.resolve();

    // The second call joins the in-flight sequence rather than starting
    // its own — only one POST goes out.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh sequence once the previous one has finished", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    wakeWorker("file");
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    prewarmCombinedWorkerForLogin("10.20.0.20");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toEqual({ kind: "login" });
    expect(init.headers["X-Worker-Wake-Secret"]).toBe("top-secret-value");
    expect(String(init.body)).not.toContain("top-secret-value");
  });

  it("throttles repeated calls from the same network-scoped IP, but not a different one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    prewarmCombinedWorkerForLogin("10.30.0.30");
    await flushMicrotasks();
    prewarmCombinedWorkerForLogin("10.30.0.31"); // same /24 network
    prewarmCombinedWorkerForLogin("10.30.0.30");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    prewarmCombinedWorkerForLogin("10.31.0.99"); // different network
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never throws even when the underlying fetch rejects", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

      expect(() => prewarmCombinedWorkerForLogin("10.40.0.40")).not.toThrow();
      await vi.advanceTimersByTimeAsync(TOTAL_SCHEDULE_MS);
    } finally {
      vi.useRealTimers();
    }
  });
});
