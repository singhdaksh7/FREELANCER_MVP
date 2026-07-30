import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma + storage) for file-state transition rules:
 * retry eligibility/limits and deletion restrictions. See
 * src/data-access/files.integration.test.ts for the real-database
 * equivalent.
 */

const FAKE_CREATOR = { id: "usr_fake", name: "Fake Creator", email: "fake@example.com", role: "CREATOR", image: null };

const prismaMock = {
  workspaceFile: { findFirst: vi.fn(), update: vi.fn() },
  fileVersion: { findMany: vi.fn(), update: vi.fn() },
  fileProcessingJob: { findFirst: vi.fn(), create: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/auth", () => ({ requireAuthenticatedUser: vi.fn().mockResolvedValue(FAKE_CREATOR) }));

const { deleteObjectMock } = vi.hoisted(() => ({ deleteObjectMock: vi.fn() }));
vi.mock("@/storage/s3-storage-provider", () => ({
  s3StorageProvider: { deleteObject: deleteObjectMock, createPresignedDownloadUrl: vi.fn() },
}));

function mockOwnedFile(overrides: Partial<Record<string, unknown>> = {}) {
  prismaMock.workspaceFile.findFirst.mockResolvedValue({
    id: "file_1",
    workspaceId: "ws_1",
    displayName: "logo.jpg",
    status: "FAILED",
    workspace: { id: "ws_1", creatorId: FAKE_CREATOR.id, status: "DRAFT" },
    currentVersion: { id: "version_1" },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  });
});

describe("retryFileProcessing — retry-limit behavior", () => {
  it("refuses to retry a file that isn't currently FAILED", async () => {
    mockOwnedFile({ status: "READY" });
    const { retryFileProcessing, FileNotRetryableError } = await import("./files");
    await expect(retryFileProcessing("file_1")).rejects.toBeInstanceOf(FileNotRetryableError);
  });

  it("refuses to retry once the attempt limit has been reached", async () => {
    mockOwnedFile({ status: "FAILED" });
    prismaMock.fileProcessingJob.findFirst.mockResolvedValue({ attempts: 3 }); // default FILE_WORKER_MAX_ATTEMPTS
    const { retryFileProcessing, FileNotRetryableError } = await import("./files");
    await expect(retryFileProcessing("file_1")).rejects.toBeInstanceOf(FileNotRetryableError);
    expect(prismaMock.fileProcessingJob.create).not.toHaveBeenCalled();
  });

  it("creates a new job with an incremented attempt count when under the limit", async () => {
    mockOwnedFile({ status: "FAILED" });
    prismaMock.fileProcessingJob.findFirst.mockResolvedValue({ attempts: 1 });
    const { retryFileProcessing } = await import("./files");
    await retryFileProcessing("file_1");

    expect(prismaMock.fileProcessingJob.create).toHaveBeenCalledWith({
      data: { fileVersionId: "version_1", status: "PENDING", attempts: 2 },
    });
    expect(prismaMock.workspaceFile.update).toHaveBeenCalledWith({
      where: { id: "file_1" },
      data: { status: "PROCESSING" },
    });
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("FILE_PROCESSING_RETRIED");
  });

  it("starts a never-yet-attempted file's retry at attempt 1", async () => {
    mockOwnedFile({ status: "FAILED" });
    prismaMock.fileProcessingJob.findFirst.mockResolvedValue(null);
    const { retryFileProcessing } = await import("./files");
    await retryFileProcessing("file_1");
    expect(prismaMock.fileProcessingJob.create).toHaveBeenCalledWith({
      data: { fileVersionId: "version_1", status: "PENDING", attempts: 1 },
    });
  });
});

describe("deleteOwnedFile — deletion rules", () => {
  it("blocks deletion for a PAID workspace, preserving delivery history", async () => {
    mockOwnedFile({ workspace: { id: "ws_1", creatorId: FAKE_CREATOR.id, status: "PAID" } });
    const { deleteOwnedFile, FileNotDeletableError } = await import("./files");
    await expect(deleteOwnedFile("file_1")).rejects.toBeInstanceOf(FileNotDeletableError);
    expect(prismaMock.workspaceFile.update).not.toHaveBeenCalled();
  });

  it("blocks deletion for a DELIVERED workspace", async () => {
    mockOwnedFile({ workspace: { id: "ws_1", creatorId: FAKE_CREATOR.id, status: "DELIVERED" } });
    const { deleteOwnedFile, FileNotDeletableError } = await import("./files");
    await expect(deleteOwnedFile("file_1")).rejects.toBeInstanceOf(FileNotDeletableError);
  });

  it("soft-deletes and best-effort removes storage objects for an eligible (DRAFT) workspace", async () => {
    mockOwnedFile({ workspace: { id: "ws_1", creatorId: FAKE_CREATOR.id, status: "DRAFT" } });
    prismaMock.fileVersion.findMany.mockResolvedValue([
      { originalStorageKey: "originals/a.jpg", previewStorageKey: "previews/a.jpg" },
    ]);
    deleteObjectMock.mockResolvedValue(undefined);

    const { deleteOwnedFile } = await import("./files");
    await deleteOwnedFile("file_1");

    expect(prismaMock.workspaceFile.update.mock.calls[0][0].data.status).toBe("DELETED");
    expect(prismaMock.workspaceFile.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(deleteObjectMock).toHaveBeenCalledWith("originals/a.jpg");
    expect(deleteObjectMock).toHaveBeenCalledWith("previews/a.jpg");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("FILE_DELETED");
  });

  it("does not fail the mutation when a storage object deletion fails (already-committed DB delete stands)", async () => {
    mockOwnedFile({ workspace: { id: "ws_1", creatorId: FAKE_CREATOR.id, status: "DRAFT" } });
    prismaMock.fileVersion.findMany.mockResolvedValue([{ originalStorageKey: "originals/a.jpg", previewStorageKey: null }]);
    deleteObjectMock.mockRejectedValue(new Error("storage unavailable"));

    const { deleteOwnedFile } = await import("./files");
    await expect(deleteOwnedFile("file_1")).resolves.toBeUndefined();
  });
});
