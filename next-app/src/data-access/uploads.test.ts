import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma + storage provider) for the upload-session
 * lifecycle: declared-size/MIME validation, workspace upload limits, and
 * server-side verification at completion time. src/data-access/uploads.integration.test.ts
 * covers the equivalent behavior against real Postgres + MinIO.
 */

const FAKE_CREATOR = { id: "usr_fake", name: "Fake Creator", email: "fake@example.com", role: "CREATOR", image: null };

const prismaMock = {
  workspace: { findFirst: vi.fn() },
  workspaceFile: { count: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
  fileVersion: { create: vi.fn() },
  fileProcessingJob: { create: vi.fn() },
  uploadSession: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/auth", () => ({ requireAuthenticatedUser: vi.fn().mockResolvedValue(FAKE_CREATOR) }));
const { logUploadTimingMock } = vi.hoisted(() => ({ logUploadTimingMock: vi.fn() }));
vi.mock("@/lib/upload-timing", () => ({ logUploadTiming: logUploadTimingMock }));

const {
  createPresignedUploadUrlMock,
  headObjectMock,
  getObjectBufferMock,
  copyObjectMock,
  deleteObjectMock,
  putObjectBufferMock,
} = vi.hoisted(() => ({
  createPresignedUploadUrlMock: vi.fn(),
  headObjectMock: vi.fn(),
  getObjectBufferMock: vi.fn(),
  copyObjectMock: vi.fn(),
  deleteObjectMock: vi.fn(),
  putObjectBufferMock: vi.fn(),
}));
vi.mock("@/storage/s3-storage-provider", () => ({
  s3StorageProvider: {
    createPresignedUploadUrl: createPresignedUploadUrlMock,
    headObject: headObjectMock,
    getObjectBuffer: getObjectBufferMock,
    copyObject: copyObjectMock,
    deleteObject: deleteObjectMock,
    putObjectBuffer: putObjectBufferMock,
    createPresignedDownloadUrl: vi.fn(),
  },
}));

const { fileTypeFromBufferMock } = vi.hoisted(() => ({ fileTypeFromBufferMock: vi.fn() }));
vi.mock("file-type", () => ({ fileTypeFromBuffer: fileTypeFromBufferMock }));

function mockOwnedWorkspace(overrides: Partial<Record<string, unknown>> = {}) {
  prismaMock.workspace.findFirst.mockResolvedValue({
    id: "ws_1",
    creatorId: FAKE_CREATOR.id,
    status: "DRAFT",
    client: { id: "cli_1", name: "Rohit Sharma", company: null },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  });
  createPresignedUploadUrlMock.mockResolvedValue({ url: "https://minio.local/signed", key: "temp/abc.jpg", expiresAt: new Date() });
  deleteObjectMock.mockResolvedValue(undefined);
  copyObjectMock.mockResolvedValue(undefined);
  putObjectBufferMock.mockResolvedValue(undefined);
  prismaMock.workspaceFile.count.mockResolvedValue(0);
  prismaMock.workspaceFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: BigInt(0) } });
  prismaMock.uploadSession.create.mockResolvedValue({ id: "session_1", timingCorrelationId: "corr_1" });
});

describe("createUploadSession — declared file validation", () => {
  it("rejects an unsupported MIME type", async () => {
    mockOwnedWorkspace();
    const { createUploadSession, UploadValidationError } = await import("./uploads");
    await expect(
      createUploadSession("ws_1", { fileName: "virus.exe", mimeType: "application/x-msdownload", sizeBytes: 100 }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });

  it("rejects a file larger than the configured maximum", async () => {
    mockOwnedWorkspace();
    const { createUploadSession, UploadValidationError } = await import("./uploads");
    await expect(
      createUploadSession("ws_1", { fileName: "huge.jpg", mimeType: "image/jpeg", sizeBytes: 999_999_999_999 }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });

  it("rejects a zero or negative declared size", async () => {
    mockOwnedWorkspace();
    const { createUploadSession, UploadValidationError } = await import("./uploads");
    await expect(
      createUploadSession("ws_1", { fileName: "empty.jpg", mimeType: "image/jpeg", sizeBytes: 0 }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });

  it("rejects when the workspace has already reached its file-count limit", async () => {
    mockOwnedWorkspace();
    prismaMock.workspaceFile.count.mockResolvedValue(50); // default UPLOAD_MAX_FILES_PER_WORKSPACE
    const { createUploadSession, UploadLimitError } = await import("./uploads");
    await expect(
      createUploadSession("ws_1", { fileName: "one-more.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }),
    ).rejects.toBeInstanceOf(UploadLimitError);
  });

  it("rejects when this upload would exceed the workspace's total storage limit", async () => {
    mockOwnedWorkspace();
    prismaMock.workspaceFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: BigInt(500 * 1024 * 1024 - 100) } });
    const { createUploadSession, UploadLimitError } = await import("./uploads");
    await expect(
      createUploadSession("ws_1", { fileName: "one-more.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }),
    ).rejects.toBeInstanceOf(UploadLimitError);
  });

  it("succeeds for a valid request and logs FILE_UPLOAD_STARTED", async () => {
    mockOwnedWorkspace();
    const { createUploadSession } = await import("./uploads");
    const result = await createUploadSession("ws_1", { fileName: "logo.jpg", mimeType: "image/jpeg", sizeBytes: 1000 });

    expect(result.sessionId).toBe("session_1");
    expect(result.uploadUrl).toBe("https://minio.local/signed");
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("FILE_UPLOAD_STARTED");
    expect(logUploadTimingMock).toHaveBeenCalledWith({
      correlationId: "corr_1",
      stage: "session_created",
      sessionId: "session_1",
      uploadKind: "new-file",
    });
  });
});

describe("completeUploadSession — server-side verification", () => {
  function mockPendingSession(overrides: Partial<Record<string, unknown>> = {}) {
    prismaMock.uploadSession.findFirst.mockResolvedValue({
      id: "session_1",
      workspaceId: "ws_1",
      creatorId: FAKE_CREATOR.id,
      storageKey: "temp/abc.jpg",
      declaredFileName: "logo.jpg",
      expectedMimeType: "image/jpeg",
      expectedSizeBytes: BigInt(1000),
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      timingCorrelationId: "corr_1",
      ...overrides,
    });
  }

  it("rejects a session that doesn't exist (or doesn't belong to this creator)", async () => {
    prismaMock.uploadSession.findFirst.mockResolvedValue(null);
    const { completeUploadSession, UploadSessionInvalidError } = await import("./uploads");
    await expect(completeUploadSession("nope")).rejects.toBeInstanceOf(UploadSessionInvalidError);
  });

  it("rejects an already-completed session", async () => {
    mockPendingSession({ status: "COMPLETED" });
    const { completeUploadSession, UploadSessionInvalidError } = await import("./uploads");
    await expect(completeUploadSession("session_1")).rejects.toBeInstanceOf(UploadSessionInvalidError);
  });

  it("rejects and marks an expired session EXPIRED", async () => {
    mockPendingSession({ expiresAt: new Date(Date.now() - 1000) });
    const { completeUploadSession, UploadSessionInvalidError } = await import("./uploads");
    await expect(completeUploadSession("session_1")).rejects.toBeInstanceOf(UploadSessionInvalidError);
    expect(prismaMock.uploadSession.update).toHaveBeenCalledWith({
      where: { id: "session_1" },
      data: { status: "EXPIRED" },
    });
  });

  it("rejects when the uploaded object cannot be found in storage", async () => {
    mockPendingSession();
    headObjectMock.mockResolvedValue(null);
    const { completeUploadSession, UploadVerificationError } = await import("./uploads");
    await expect(completeUploadSession("session_1")).rejects.toBeInstanceOf(UploadVerificationError);
  });

  it("rejects on a size mismatch between the declared and actual object size", async () => {
    mockPendingSession();
    headObjectMock.mockResolvedValue({ key: "temp/abc.jpg", sizeBytes: 999, contentType: "image/jpeg", etag: "x" });
    const { completeUploadSession, UploadVerificationError } = await import("./uploads");
    await expect(completeUploadSession("session_1")).rejects.toBeInstanceOf(UploadVerificationError);
  });

  it("rejects when magic-byte sniffing doesn't match a supported type — never trusts the declared MIME type", async () => {
    mockPendingSession();
    headObjectMock.mockResolvedValue({ key: "temp/abc.jpg", sizeBytes: 1000, contentType: "image/jpeg", etag: "x" });
    getObjectBufferMock.mockResolvedValue(Buffer.from("not actually a jpeg"));
    fileTypeFromBufferMock.mockResolvedValue({ mime: "text/html", ext: "html" });
    const { completeUploadSession, UploadVerificationError } = await import("./uploads");
    await expect(completeUploadSession("session_1")).rejects.toBeInstanceOf(UploadVerificationError);
    expect(deleteObjectMock).toHaveBeenCalledWith("temp/abc.jpg");
  });

  it("succeeds when everything verifies, creating WorkspaceFile/FileVersion/FileProcessingJob", async () => {
    mockPendingSession();
    headObjectMock.mockResolvedValue({ key: "temp/abc.jpg", sizeBytes: 1000, contentType: "image/jpeg", etag: "x" });
    getObjectBufferMock.mockResolvedValue(Buffer.from("a".repeat(1000)));
    fileTypeFromBufferMock.mockResolvedValue({ mime: "image/jpeg", ext: "jpg" });
    prismaMock.workspaceFile.create.mockResolvedValue({ id: "file_1" });
    prismaMock.fileVersion.create.mockResolvedValue({ id: "version_1" });

    const { completeUploadSession } = await import("./uploads");
    const result = await completeUploadSession("session_1");

    expect(result.fileId).toBe("file_1");
    expect(prismaMock.fileProcessingJob.create.mock.calls[0][0].data.attempts).toBe(1);
    expect(prismaMock.fileProcessingJob.create.mock.calls[0][0].data.timingCorrelationId).toBe("corr_1");
    expect(logUploadTimingMock).toHaveBeenCalledWith(expect.objectContaining({ stage: "completion_started", correlationId: "corr_1" }));
    expect(logUploadTimingMock).toHaveBeenCalledWith(expect.objectContaining({ stage: "job_created", correlationId: "corr_1" }));
    expect(logUploadTimingMock).toHaveBeenCalledWith(expect.objectContaining({ stage: "completion_finished", correlationId: "corr_1" }));
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("FILE_UPLOADED");
  });

  describe("writing verified bytes to originals/ — no S3 CopyObject", () => {
    function mockVerifiedUpload(buffer = Buffer.from("a".repeat(1000))) {
      mockPendingSession();
      headObjectMock.mockResolvedValue({ key: "temp/abc.jpg", sizeBytes: 1000, contentType: "image/jpeg", etag: "x" });
      getObjectBufferMock.mockResolvedValue(buffer);
      fileTypeFromBufferMock.mockResolvedValue({ mime: "image/jpeg", ext: "jpg" });
      prismaMock.workspaceFile.create.mockResolvedValue({ id: "file_1" });
      prismaMock.fileVersion.create.mockResolvedValue({ id: "version_1" });
      return buffer;
    }

    it("writes the verified bytes to the generated originals/ key using the sniffed MIME type", async () => {
      const buffer = mockVerifiedUpload();
      const { completeUploadSession } = await import("./uploads");
      await completeUploadSession("session_1");

      expect(putObjectBufferMock).toHaveBeenCalledTimes(1);
      const [key, writtenBuffer, contentType] = putObjectBufferMock.mock.calls[0];
      expect(key).toMatch(/^originals\//);
      expect(writtenBuffer).toBe(buffer);
      expect(contentType).toBe("image/jpeg");
    });

    it("never issues an S3 CopyObject request during upload completion", async () => {
      mockVerifiedUpload();
      const { completeUploadSession } = await import("./uploads");
      await completeUploadSession("session_1");

      expect(copyObjectMock).not.toHaveBeenCalled();
    });

    it("deletes the temp object only after the destination write has succeeded", async () => {
      mockVerifiedUpload();
      const callOrder: string[] = [];
      putObjectBufferMock.mockImplementation(async () => {
        callOrder.push("putObjectBuffer");
      });
      deleteObjectMock.mockImplementation(async () => {
        callOrder.push("deleteObject");
      });

      const { completeUploadSession } = await import("./uploads");
      await completeUploadSession("session_1");

      expect(callOrder).toEqual(["putObjectBuffer", "deleteObject"]);
    });

    it("does not delete the temp object, and leaves the upload session PENDING, when the destination write fails", async () => {
      mockVerifiedUpload();
      const writeError = new Error("MissingParameter: Missing Required Parameter CopySource");
      putObjectBufferMock.mockRejectedValue(writeError);

      const { completeUploadSession } = await import("./uploads");
      await expect(completeUploadSession("session_1")).rejects.toThrow(writeError);

      expect(deleteObjectMock).not.toHaveBeenCalled();
      // No status-changing update was made on this failure path — the
      // session (already PENDING from mockPendingSession) is left as-is,
      // and the temp object remains available for a retry.
      expect(prismaMock.uploadSession.update).not.toHaveBeenCalled();
    });
  });
});
