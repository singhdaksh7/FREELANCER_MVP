import { describe, expect, it, vi, afterEach } from "vitest";
import { wakeWorker } from "./worker-wake";

const originalUrl = process.env.WORKER_WAKE_URL;
const originalSecret = process.env.WORKER_WAKE_SECRET;
const originalFetch = global.fetch;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.WORKER_WAKE_URL;
  else process.env.WORKER_WAKE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.WORKER_WAKE_SECRET;
  else process.env.WORKER_WAKE_SECRET = originalSecret;
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("wakeWorker", () => {
  it("is a no-op (never calls fetch) when WORKER_WAKE_URL is unset", () => {
    delete process.env.WORKER_WAKE_URL;
    process.env.WORKER_WAKE_SECRET = "secret";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => wakeWorker("file")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op (never calls fetch) when WORKER_WAKE_SECRET is unset", () => {
    process.env.WORKER_WAKE_URL = "https://worker.example/wake";
    delete process.env.WORKER_WAKE_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => wakeWorker("delivery")).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to WORKER_WAKE_URL with the secret in a header, never in the body", async () => {
    process.env.WORKER_WAKE_URL = "https://worker.example/wake";
    process.env.WORKER_WAKE_SECRET = "top-secret-value";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
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

  it("never throws and does not reject when the wake request fails — a failed wake must never fail the caller's mutation", async () => {
    process.env.WORKER_WAKE_URL = "https://worker.example/wake";
    process.env.WORKER_WAKE_SECRET = "secret";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => wakeWorker("delivery")).not.toThrow();
    // Let the rejected fetch's .catch() handler run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalled();
    const loggedText = errorSpy.mock.calls.map((c) => JSON.stringify(c)).join(" ");
    expect(loggedText).not.toContain("secret");
  });

  it("bounds the request with a short timeout signal", () => {
    process.env.WORKER_WAKE_URL = "https://worker.example/wake";
    process.env.WORKER_WAKE_SECRET = "secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    wakeWorker("file");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
