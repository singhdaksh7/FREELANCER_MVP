import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedCreator, wakeWorker } = vi.hoisted(() => ({
  getAuthenticatedCreator: vi.fn(),
  wakeWorker: vi.fn(),
}));
vi.mock("@/data-access/auth", () => ({ getAuthenticatedCreator }));
vi.mock("@/lib/worker-wake", () => ({ wakeWorker }));

describe("prewarmFileWorkerAction", () => {
  beforeEach(() => {
    getAuthenticatedCreator.mockReset();
    wakeWorker.mockReset();
  });

  it("pings the file worker for an authenticated session", async () => {
    getAuthenticatedCreator.mockResolvedValueOnce({ id: "usr_1", name: "Arjun Raj" });
    const { prewarmFileWorkerAction } = await import("./worker-wake");

    await prewarmFileWorkerAction();

    expect(wakeWorker).toHaveBeenCalledWith("file");
  });

  it("never wakes the worker for an unauthenticated caller", async () => {
    getAuthenticatedCreator.mockResolvedValueOnce(null);
    const { prewarmFileWorkerAction } = await import("./worker-wake");

    await prewarmFileWorkerAction();

    expect(wakeWorker).not.toHaveBeenCalled();
  });

  it("throttles repeated calls from the same creator within the window, but never blocks a different creator", async () => {
    getAuthenticatedCreator.mockResolvedValue({ id: "usr_throttle_test", name: "Meera Shah" });
    const { prewarmFileWorkerAction } = await import("./worker-wake");

    await prewarmFileWorkerAction();
    await prewarmFileWorkerAction();
    await prewarmFileWorkerAction();
    expect(wakeWorker).toHaveBeenCalledTimes(1);

    getAuthenticatedCreator.mockResolvedValue({ id: "usr_throttle_test_2", name: "Arjun Raj" });
    await prewarmFileWorkerAction();
    expect(wakeWorker).toHaveBeenCalledTimes(2);
  });
});
