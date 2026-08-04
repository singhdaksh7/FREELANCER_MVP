import { describe, expect, it, vi, afterAll, beforeAll } from "vitest";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { getStorageConfig } from "@/storage/storage-config";
import { claimNextJob, processJob, type ClaimedJob } from "@/worker/job-processor";

/**
 * Integration tests for Phase 5 file upload/processing against the real
 * test database and the real local MinIO instance (see
 * FILE_PROCESSING_RUNBOOK.md "Local MinIO startup"). Every object these
 * tests create uses a fresh random storage key (src/storage/storage-keys.ts),
 * so nothing collides with development data; each test's created rows/
 * objects are removed in afterAll. Run this file, like all
 * `*.integration.test.ts` files, via `npm run test:integration` —
 * requires MinIO to be running (`docker compose up -d minio minio-init`).
 */

const ARJUN_ID = "usr_arjun";
const MEERA_ID = "usr_meera";
const ARJUN_WORKSPACE_ID = "ws_brand_identity"; // seeded, IN_REVIEW — not financially locked
const MEERA_WORKSPACE_ID = "ws_portfolio_refresh"; // seeded, belongs to Meera
const PAID_WORKSPACE_ID = "ws_product_pkg"; // seeded, PAID — financially locked

const { requireAuthenticatedUserMock } = vi.hoisted(() => ({ requireAuthenticatedUserMock: vi.fn() }));
vi.mock("@/data-access/auth", () => ({ requireAuthenticatedUser: requireAuthenticatedUserMock }));

function signInAs(userId: string) {
  requireAuthenticatedUserMock.mockResolvedValue({
    id: userId,
    name: userId === ARJUN_ID ? "Arjun Raj" : "Meera Shah",
    email: `${userId}@example.com`,
    role: "CREATOR",
    image: null,
  });
}

const createdFileIds: string[] = [];
const createdStorageKeys: string[] = [];

async function makeJpeg(width = 640, height = 480): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } } })
    .jpeg()
    .toBuffer();
}

async function makePdf(pageCount = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 30, font });
  }
  return Buffer.from(await doc.save());
}

async function makeZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("readme.txt", "integration test archive contents");
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Really PUTs to the presigned URL (a real HTTP request to local MinIO) — the same request a browser would make. */
async function putToPresignedUrl(uploadUrl: string, body: Buffer, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new Error(`PUT to presigned URL failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * Claims the specific PENDING job for a given fileVersionId, rather than
 * "whatever's globally oldest" (claimNextJob's real production semantics)
 * — several tests in this file create a job and deliberately never
 * consume it (that's the point of the "creates ... records" test, which
 * only asserts the job exists), so a later test relying on
 * "oldest pending" would nondeterministically pick up an earlier test's
 * leftover job instead of its own.
 */
async function claimJobForVersion(fileVersionId: string): Promise<NonNullable<ClaimedJob>> {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE file_processing_jobs
    SET status = 'PROCESSING', "startedAt" = now(), "updatedAt" = now()
    WHERE id = (
      SELECT id FROM file_processing_jobs
      WHERE status = 'PENDING' AND "fileVersionId" = ${fileVersionId}
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  const jobId = claimed[0]?.id;
  if (!jobId) throw new Error(`No pending job found for fileVersion ${fileVersionId}`);
  return prisma.fileProcessingJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { fileVersion: { include: { file: { include: { workspace: { include: { client: true } } } } } } },
  });
}

beforeAll(async () => {
  // Sanity check the bucket is reachable before running — a clearer
  // failure than 15 individually confusing timeouts if MinIO isn't up.
  const probe = await s3StorageProvider.headObject("temp/__integration_probe__");
  expect(probe).toBeNull(); // doesn't exist, but the call itself must not throw
});

afterAll(async () => {
  await Promise.allSettled(createdStorageKeys.map((key) => s3StorageProvider.deleteObject(key)));
  await prisma.fileProcessingJob.deleteMany({ where: { fileVersion: { file: { id: { in: createdFileIds } } } } });
  await prisma.fileVersion.deleteMany({ where: { file: { id: { in: createdFileIds } } } });
  await prisma.workspaceFile.deleteMany({ where: { id: { in: createdFileIds } } });
  await prisma.uploadSession.deleteMany({ where: { workspaceId: { in: [ARJUN_WORKSPACE_ID, PAID_WORKSPACE_ID] }, declaredFileName: { contains: "integration-test" } } });
  await prisma.$disconnect();
});

describe("upload session lifecycle", () => {
  it("creates an upload session for a workspace the creator owns", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession } = await import("./uploads");

    const result = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-session.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });

    expect(result.sessionId).toBeTruthy();
    expect(result.uploadUrl.startsWith("http")).toBe(true);

    const stored = await prisma.uploadSession.findUniqueOrThrow({ where: { id: result.sessionId } });
    expect(stored.status).toBe("PENDING");
    expect(stored.workspaceId).toBe(ARJUN_WORKSPACE_ID);
  });

  it("refuses to create a session for another creator's workspace", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession } = await import("./uploads");
    const { OwnershipError } = await import("./authorization");

    await expect(
      createUploadSession(MEERA_WORKSPACE_ID, {
        fileName: "integration-test-hijack.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("rejects an expired session", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession, UploadSessionInvalidError } = await import("./uploads");

    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-expired.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    await prisma.uploadSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(completeUploadSession(session.sessionId)).rejects.toBeInstanceOf(UploadSessionInvalidError);
    const stored = await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(stored.status).toBe("EXPIRED");
  });

  it("verifies the uploaded object's actual size and rejects a mismatch", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession, UploadVerificationError } = await import("./uploads");

    const jpeg = await makeJpeg();
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-size-mismatch.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength + 500, // declare a size that won't match what's actually uploaded
    });
    await putToPresignedUrl(session.uploadUrl, jpeg, "image/jpeg");

    await expect(completeUploadSession(session.sessionId)).rejects.toBeInstanceOf(UploadVerificationError);
  });

  it("rejects content whose real (magic-byte-sniffed) type isn't supported, regardless of the declared MIME type", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession, UploadVerificationError } = await import("./uploads");

    const notActuallyAnImage = Buffer.from("<html><body>not an image</body></html>", "utf-8");
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-fake-image.jpg",
      mimeType: "image/jpeg",
      sizeBytes: notActuallyAnImage.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, notActuallyAnImage, "image/jpeg");

    await expect(completeUploadSession(session.sessionId)).rejects.toBeInstanceOf(UploadVerificationError);
  });

  it("creates WorkspaceFile/FileVersion/FileProcessingJob rows for a genuinely valid image, and keeps the original private", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession } = await import("./uploads");

    const jpeg = await makeJpeg(800, 600);
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-valid.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, jpeg, "image/jpeg");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);

    const file = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    expect(file.status).toBe("PROCESSING");
    expect(file.fileKind).toBe("IMAGE");
    expect(file.currentVersion).not.toBeNull();
    expect(file.currentVersion!.versionNumber).toBe(1);
    expect(file.currentVersion!.originalStorageKey.startsWith("originals/")).toBe(true);
    createdStorageKeys.push(file.currentVersion!.originalStorageKey);

    const job = await prisma.fileProcessingJob.findFirstOrThrow({ where: { fileVersionId: file.currentVersion!.id } });
    expect(job.status).toBe("PENDING");

    // "Original remains private": no anonymous, unsigned request to the
    // bucket can read the object — MinIO returns an access-denied/error
    // response, never the file's bytes.
    const config = getStorageConfig();
    const unsignedResponse = await fetch(`${config.endpoint}/${config.bucket}/${file.currentVersion!.originalStorageKey}`);
    expect(unsignedResponse.ok).toBe(false);
  });
});

describe("worker processing", () => {
  it("produces a protected preview whose checksum differs from the original, and marks the file READY", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession } = await import("./uploads");

    const jpeg = await makeJpeg(1000, 700);
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-worker.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, jpeg, "image/jpeg");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);

    const created = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    const job = await claimJobForVersion(created.currentVersionId!);
    await processJob(prisma, job);

    const file = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    expect(file.status).toBe("READY");
    expect(file.currentVersion!.previewStorageKey).not.toBeNull();
    expect(file.currentVersion!.previewChecksum).not.toBe(file.currentVersion!.originalChecksum);
    createdStorageKeys.push(file.currentVersion!.originalStorageKey, file.currentVersion!.previewStorageKey!);

    const previewMeta = await s3StorageProvider.headObject(file.currentVersion!.previewStorageKey!);
    expect(previewMeta).not.toBeNull();

    // Regression: the delivered original must never receive watermark
    // compositing — the object at originalStorageKey stays byte-for-byte
    // identical to what was uploaded, while the preview object is a
    // distinct, smaller, watermarked JPEG.
    const originalBytes = await s3StorageProvider.getObjectBuffer(file.currentVersion!.originalStorageKey);
    expect(Buffer.compare(originalBytes, jpeg)).toBe(0);

    const previewBytes = await s3StorageProvider.getObjectBuffer(file.currentVersion!.previewStorageKey!);
    expect(Buffer.compare(previewBytes, originalBytes)).not.toBe(0);
  });

  it("generates a fresh, independently-watermarked preview for a revised (second) version of the same file", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession, createFileVersionUploadSession } = await import("./uploads");

    const v1Jpeg = await makeJpeg(900, 600);
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-revision.jpg",
      mimeType: "image/jpeg",
      sizeBytes: v1Jpeg.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, v1Jpeg, "image/jpeg");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);

    const v1 = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    await processJob(prisma, await claimJobForVersion(v1.currentVersionId!));

    const v2Jpeg = await makeJpeg(900, 600); // same dimensions, distinguishable only by its own watermark content/checksum
    const v2Session = await createFileVersionUploadSession(fileId, {
      fileName: "integration-test-revision.jpg",
      mimeType: "image/jpeg",
      sizeBytes: v2Jpeg.byteLength,
    });
    await putToPresignedUrl(v2Session.uploadUrl, v2Jpeg, "image/jpeg");
    const { fileId: sameFileId } = await completeUploadSession(v2Session.sessionId);
    expect(sameFileId).toBe(fileId);

    const beforeV2 = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    const v2VersionId = beforeV2.pendingVersionId ?? beforeV2.currentVersionId!;
    await processJob(prisma, await claimJobForVersion(v2VersionId));

    const v2 = await prisma.fileVersion.findUniqueOrThrow({ where: { id: v2VersionId } });
    expect(v2.previewStorageKey).not.toBeNull();
    expect(v2.previewStorageKey).not.toBe(
      (await prisma.fileVersion.findUniqueOrThrow({ where: { id: v1.currentVersionId! } })).previewStorageKey,
    );
    createdStorageKeys.push(v2.originalStorageKey, v2.previewStorageKey!);

    const v2OriginalBytes = await s3StorageProvider.getObjectBuffer(v2.originalStorageKey);
    expect(Buffer.compare(v2OriginalBytes, v2Jpeg)).toBe(0);
  });

  it("PDF: rasterizes page 1 into a real, distinct protected preview and marks the file READY", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession } = await import("./uploads");

    const pdf = await makePdf(2);
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-worker.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdf.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, pdf, "application/pdf");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);

    const created = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(created.fileKind).toBe("PDF");
    const job = await claimJobForVersion(created.currentVersionId!);
    await processJob(prisma, job);

    const file = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    expect(file.status).toBe("READY");
    expect(file.currentVersion!.previewStorageKey).not.toBeNull();
    createdStorageKeys.push(file.currentVersion!.originalStorageKey, file.currentVersion!.previewStorageKey!);

    // The original PDF stays private and byte-identical; the preview is a
    // distinct, watermarked JPEG raster of page 1 only.
    const originalBytes = await s3StorageProvider.getObjectBuffer(file.currentVersion!.originalStorageKey);
    expect(Buffer.compare(originalBytes, pdf)).toBe(0);

    const previewBytes = await s3StorageProvider.getObjectBuffer(file.currentVersion!.previewStorageKey!);
    const previewMetadata = await sharp(previewBytes).metadata();
    expect(previewMetadata.format).toBe("jpeg");
    expect(Buffer.compare(previewBytes, originalBytes)).not.toBe(0);
  });

  it("ARCHIVE (ZIP): marked READY with no generated preview, never treated as a locked-deliverable-pending-payment case", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession } = await import("./uploads");

    const zip = await makeZip();
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-worker.zip",
      mimeType: "application/zip",
      sizeBytes: zip.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, zip, "application/zip");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);

    const created = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(created.fileKind).toBe("ARCHIVE");
    const job = await claimJobForVersion(created.currentVersionId!);
    await processJob(prisma, job);

    const file = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    expect(file.status).toBe("READY");
    expect(file.currentVersion!.previewStorageKey).toBeNull();
    createdStorageKeys.push(file.currentVersion!.originalStorageKey);
  });

  it("refuses preview access to a different creator", async () => {
    // fileId from the previous test belongs to Arjun.
    const arjunFile = await prisma.workspaceFile.findFirstOrThrow({
      where: { workspaceId: ARJUN_WORKSPACE_ID, displayName: "integration-test-worker.jpg" },
    });

    signInAs(MEERA_ID);
    const { getOwnedFilePreviewUrl } = await import("./files");
    const { OwnershipError } = await import("./authorization");
    await expect(getOwnedFilePreviewUrl(arjunFile.id)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("records a safe error (not a raw Sharp exception) when processing a corrupt image, and retry re-queues it safely", async () => {
    signInAs(ARJUN_ID);
    const corruptKey = `originals/integration-test-corrupt-${Date.now()}.jpg`;
    await s3StorageProvider.putObjectBuffer(corruptKey, Buffer.from("not a real jpeg"), "image/jpeg");
    createdStorageKeys.push(corruptKey);

    const file = await prisma.workspaceFile.create({
      data: {
        workspaceId: ARJUN_WORKSPACE_ID,
        displayName: "integration-test-corrupt.jpg",
        fileKind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: BigInt(16),
        status: "PROCESSING",
      },
    });
    createdFileIds.push(file.id);
    const version = await prisma.fileVersion.create({
      data: {
        fileId: file.id,
        versionNumber: 1,
        originalStorageKey: corruptKey,
        originalChecksum: "deadbeef",
        originalSizeBytes: BigInt(16),
        mimeType: "image/jpeg",
      },
    });
    await prisma.workspaceFile.update({ where: { id: file.id }, data: { currentVersionId: version.id } });
    await prisma.fileProcessingJob.create({ data: { fileVersionId: version.id, status: "PENDING", attempts: 1 } });

    const job = await claimJobForVersion(version.id);
    await processJob(prisma, job);

    const afterFirstAttempt = await prisma.workspaceFile.findUniqueOrThrow({
      where: { id: file.id },
      include: { currentVersion: true },
    });
    expect(afterFirstAttempt.status).toBe("FAILED");
    expect(afterFirstAttempt.currentVersion!.processingError).toBeTruthy();
    // Never a raw Sharp/library error message.
    expect(afterFirstAttempt.currentVersion!.processingError).not.toMatch(/sharp|libvips|ENOENT/i);

    const failedJob = await prisma.fileProcessingJob.findFirstOrThrow({ where: { fileVersionId: version.id } });
    expect(failedJob.status).toBe("FAILED");

    // Retry: creates a new job with an incremented attempt count and
    // re-queues the file for processing.
    const { retryFileProcessing } = await import("./files");
    await retryFileProcessing(file.id);

    const afterRetryRequest = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(afterRetryRequest.status).toBe("PROCESSING");

    const retriedJob = await claimJobForVersion(version.id);
    expect(retriedJob.attempts).toBe(2);
    await processJob(prisma, retriedJob);

    const afterSecondAttempt = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(afterSecondAttempt.status).toBe("FAILED"); // still corrupt — expected to fail again
  });
});

describe("job claiming — atomic, no double-processing", () => {
  it("never lets two concurrent claims grab the same PENDING job (FOR UPDATE SKIP LOCKED)", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession } = await import("./uploads");

    const jpeg = await makeJpeg(200, 200);
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-concurrent-claim.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, jpeg, "image/jpeg");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);
    const created = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    createdStorageKeys.push((await prisma.fileVersion.findUniqueOrThrow({ where: { id: created.currentVersionId! } })).originalStorageKey);

    // Two "workers" racing to claim whatever's oldest-pending at the same
    // moment — only one may ever receive this job's id; a real
    // concurrent worker deployment relies on exactly this guarantee.
    const [first, second] = await Promise.all([claimNextJob(prisma), claimNextJob(prisma)]);
    const claimedIds = [first?.id, second?.id].filter(Boolean);
    const uniqueClaimedIds = new Set(claimedIds);
    expect(uniqueClaimedIds.size).toBe(claimedIds.length); // no id claimed twice

    // Whichever of the two got this test's job: finish it so it doesn't
    // leak into a later test as a stray PENDING/PROCESSING row.
    const oursIsFirst = first?.fileVersion.fileId === fileId;
    const ours = oursIsFirst ? first : second?.fileVersion.fileId === fileId ? second : null;
    if (ours) await processJob(prisma, ours);
  });
});

describe("file deletion", () => {
  it("soft-deletes the database record and removes the private storage objects", async () => {
    signInAs(ARJUN_ID);
    const { createUploadSession, completeUploadSession } = await import("./uploads");
    const { deleteOwnedFile } = await import("./files");

    const jpeg = await makeJpeg(300, 300);
    const session = await createUploadSession(ARJUN_WORKSPACE_ID, {
      fileName: "integration-test-to-delete.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    });
    await putToPresignedUrl(session.uploadUrl, jpeg, "image/jpeg");
    const { fileId } = await completeUploadSession(session.sessionId);
    createdFileIds.push(fileId);

    const beforeDelete = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId }, include: { currentVersion: true } });
    const originalKey = beforeDelete.currentVersion!.originalStorageKey;

    await deleteOwnedFile(fileId);

    const afterDelete = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: fileId } });
    expect(afterDelete.status).toBe("DELETED");
    expect(afterDelete.deletedAt).not.toBeNull();

    const objectStillThere = await s3StorageProvider.headObject(originalKey);
    expect(objectStillThere).toBeNull();
  });

  it("blocks file deletion for a PAID workspace, preserving delivery/payment history", async () => {
    signInAs(ARJUN_ID);
    const file = await prisma.workspaceFile.create({
      data: {
        workspaceId: PAID_WORKSPACE_ID,
        displayName: "integration-test-paid-workspace-file.jpg",
        fileKind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: BigInt(1000),
        status: "READY",
      },
    });
    createdFileIds.push(file.id);

    const { deleteOwnedFile, FileNotDeletableError } = await import("./files");
    await expect(deleteOwnedFile(file.id)).rejects.toBeInstanceOf(FileNotDeletableError);

    const stillThere = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(stillThere.status).toBe("READY");
    expect(stillThere.deletedAt).toBeNull();
  });
});
