import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { requireOwnedWorkspace, requireOwnedWorkspaceFile } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { generateStorageKey, STORAGE_PREFIXES } from "@/storage/storage-keys";
import { createUploadPresignedUrl } from "@/storage/signed-urls";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { getUploadLimits } from "@/storage/storage-config";
import { isSupportedMimeType, mimeTypeToFileKind } from "@/lib/file-kind";
import type { FileKind } from "@/generated/prisma/enums";
import { sanitizeDisplayFileName, extensionHintFromFileName } from "@/lib/filename-sanitize";
import { bigIntToDisplayNumber, numberToStorageBigInt } from "@/lib/bytes";
import { sha256Hex } from "@/lib/checksum";
import { wakeWorker } from "@/lib/worker-wake";
import { randomUUID } from "node:crypto";
import { logUploadTiming } from "@/lib/upload-timing";

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export class UploadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadLimitError";
  }
}

export class UploadSessionInvalidError extends Error {
  constructor(message = "This upload session is no longer valid.") {
    super(message);
    this.name = "UploadSessionInvalidError";
  }
}

export class UploadVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadVerificationError";
  }
}

async function assertWithinWorkspaceLimits(workspaceId: string, incomingSizeBytes: number): Promise<void> {
  const limits = getUploadLimits();
  const [fileCount, totalBytesAgg] = await Promise.all([
    prisma.workspaceFile.count({ where: { workspaceId, deletedAt: null } }),
    prisma.workspaceFile.aggregate({ where: { workspaceId, deletedAt: null }, _sum: { sizeBytes: true } }),
  ]);

  if (fileCount >= limits.maxFilesPerWorkspace) {
    throw new UploadLimitError(`This workspace has reached its maximum of ${limits.maxFilesPerWorkspace} files.`);
  }
  const currentTotal = bigIntToDisplayNumber(totalBytesAgg._sum.sizeBytes ?? BigInt(0));
  if (currentTotal + incomingSizeBytes > limits.maxTotalWorkspaceBytes) {
    throw new UploadLimitError("This upload would exceed the workspace's total storage limit.");
  }
}

export interface CreateUploadSessionInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CreateUploadSessionResult {
  sessionId: string;
  timingCorrelationId: string;
  uploadUrl: string;
  expiresAt: string;
}

/**
 * Step 1-5 of the secure upload workflow (see FILE_STORAGE_ARCHITECTURE.md):
 * verifies ownership, validates the *declared* filename/size/MIME type
 * (never trusted as final truth — see completeUploadSession), generates a
 * random temp/ storage key, and returns a presigned PUT URL valid only
 * for that one key.
 */
export async function createUploadSession(
  workspaceId: string,
  input: CreateUploadSessionInput,
): Promise<CreateUploadSessionResult> {
  const { creator } = await requireOwnedWorkspace(workspaceId);
  const limits = getUploadLimits();

  if (!isSupportedMimeType(input.mimeType)) {
    throw new UploadValidationError("This file type isn't supported.");
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new UploadValidationError("Invalid file size.");
  }
  if (input.sizeBytes > limits.maxFileSizeBytes) {
    throw new UploadValidationError(
      `Files must be under ${Math.floor(limits.maxFileSizeBytes / (1024 * 1024))} MB.`,
    );
  }
  await assertWithinWorkspaceLimits(workspaceId, input.sizeBytes);

  const sanitizedName = sanitizeDisplayFileName(input.fileName);
  const extensionHint = extensionHintFromFileName(input.fileName);
  const storageKey = generateStorageKey(STORAGE_PREFIXES.temp, extensionHint);

  const { url, expiresAt } = await createUploadPresignedUrl(storageKey, input.mimeType);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.uploadSession.create({
      data: {
        workspaceId,
        creatorId: creator.id,
        storageKey,
        timingCorrelationId: randomUUID(),
        declaredFileName: sanitizedName,
        expectedMimeType: input.mimeType,
        expectedSizeBytes: numberToStorageBigInt(input.sizeBytes),
        status: "PENDING",
        expiresAt,
      },
    });
    await recordActivity(tx, {
      action: ActivityAction.FILE_UPLOAD_STARTED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
      metadata: { fileName: sanitizedName },
    });
    return created;
  });
  logUploadTiming({ correlationId: session.timingCorrelationId, stage: "upload_session_created" });

  return { sessionId: session.id, timingCorrelationId: session.timingCorrelationId, uploadUrl: url, expiresAt: expiresAt.toISOString() };
}

export class FileVersionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileVersionNotAllowedError";
  }
}

/**
 * Step 1-4 of the version-upload workflow (see FILE_STORAGE_ARCHITECTURE.md
 * / CLIENT_REVIEW_ARCHITECTURE.md "File-version workflow"): same
 * declared-metadata validation as createUploadSession, but scoped to an
 * *existing, owned* file — `UploadSession.targetFileId` is what tells
 * completeUploadSession to create a new FileVersion instead of a new
 * WorkspaceFile. Blocked once the workspace has a non-revoked approval
 * (destructive replacement after approval requires the approval to be
 * revoked first, per the brief) or is cancelled/delivered.
 */
export async function createFileVersionUploadSession(
  fileId: string,
  input: CreateUploadSessionInput,
): Promise<CreateUploadSessionResult> {
  const { creator, file } = await requireOwnedWorkspaceFile(fileId);
  const limits = getUploadLimits();

  if (["CANCELLED", "DELIVERED"].includes(file.workspace.status)) {
    throw new FileVersionNotAllowedError("This workspace can no longer accept new file versions.");
  }
  const activeApproval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId: file.workspace.id, status: "APPROVED" },
  });
  if (activeApproval) {
    throw new FileVersionNotAllowedError(
      "This project has already been approved — revoke the approval before uploading a new version.",
    );
  }

  if (!isSupportedMimeType(input.mimeType)) {
    throw new UploadValidationError("This file type isn't supported.");
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new UploadValidationError("Invalid file size.");
  }
  if (input.sizeBytes > limits.maxFileSizeBytes) {
    throw new UploadValidationError(
      `Files must be under ${Math.floor(limits.maxFileSizeBytes / (1024 * 1024))} MB.`,
    );
  }

  const sanitizedName = sanitizeDisplayFileName(input.fileName);
  const extensionHint = extensionHintFromFileName(input.fileName);
  const storageKey = generateStorageKey(STORAGE_PREFIXES.temp, extensionHint);

  const { url, expiresAt } = await createUploadPresignedUrl(storageKey, input.mimeType);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.uploadSession.create({
      data: {
        workspaceId: file.workspace.id,
        creatorId: creator.id,
        targetFileId: fileId,
        storageKey,
        timingCorrelationId: randomUUID(),
        declaredFileName: sanitizedName,
        expectedMimeType: input.mimeType,
        expectedSizeBytes: numberToStorageBigInt(input.sizeBytes),
        status: "PENDING",
        expiresAt,
      },
    });
    await recordActivity(tx, {
      action: ActivityAction.FILE_VERSION_UPLOAD_STARTED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: file.workspace.id,
      metadata: { fileName: sanitizedName },
    });
    return created;
  });

  logUploadTiming({ correlationId: session.timingCorrelationId, stage: "upload_session_created" });
  return { sessionId: session.id, timingCorrelationId: session.timingCorrelationId, uploadUrl: url, expiresAt: expiresAt.toISOString() };
}

export interface CompleteUploadResult {
  fileId: string;
  workspaceId: string;
  timingCorrelationId: string;
}

/**
 * Steps 7-11 of the secure upload workflow: verifies the browser actually
 * uploaded the declared object (existence + exact size via server-side
 * `headObject`, then real content-type via magic-byte sniffing of the
 * downloaded bytes — never the browser-declared MIME type), writes those
 * same verified bytes into `originals/` under a **new** random key (the
 * temp key is never reused as the permanent one) via `putObjectBuffer` —
 * never a server-side CopyObject, since the already-downloaded buffer is
 * on hand and some S3-compatible providers reject CopyObject outright —
 * and creates the WorkspaceFile/FileVersion/FileProcessingJob row set the
 * worker will pick up. The temp object is deleted (best-effort) only
 * after the originals/ write has succeeded; if that write fails, the
 * temp object is left in place and the upload session stays PENDING so
 * completion can be retried.
 */
export async function completeUploadSession(sessionId: string): Promise<CompleteUploadResult> {
  const creator = await requireAuthenticatedUser();

  const session = await prisma.uploadSession.findFirst({ where: { id: sessionId, creatorId: creator.id } });
  if (!session) throw new UploadSessionInvalidError();
  if (session.status !== "PENDING") {
    throw new UploadSessionInvalidError("This upload has already been completed or cancelled.");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    throw new UploadSessionInvalidError("This upload session has expired — please try uploading again.");
  }

  const objectMeta = await s3StorageProvider.headObject(session.storageKey);
  if (!objectMeta) {
    throw new UploadVerificationError("The uploaded file could not be found in storage.");
  }

  const expectedSizeBytes = bigIntToDisplayNumber(session.expectedSizeBytes);
  if (objectMeta.sizeBytes !== expectedSizeBytes) {
    await s3StorageProvider.deleteObject(session.storageKey).catch(() => {});
    await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "ABORTED" } });
    throw new UploadVerificationError("The uploaded file's size did not match what was declared.");
  }

  const buffer = await s3StorageProvider.getObjectBuffer(session.storageKey);
  // Explicit Uint8Array conversion: file-type's realm-sensitive `instanceof`
  // check can otherwise reject a perfectly valid Node Buffer (observed
  // under Vitest's jsdom test environment; harmless in production too).
  const sniffed = await fileTypeFromBuffer(new Uint8Array(buffer));
  const sniffedMimeType = sniffed?.mime;

  if (!sniffedMimeType || !isSupportedMimeType(sniffedMimeType)) {
    await s3StorageProvider.deleteObject(session.storageKey).catch(() => {});
    await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "ABORTED" } });
    throw new UploadVerificationError("This file's actual content doesn't match a supported file type.");
  }

  await assertWithinWorkspaceLimits(session.workspaceId, objectMeta.sizeBytes);

  const fileKind = mimeTypeToFileKind(sniffedMimeType);
  const originalKey = generateStorageKey(STORAGE_PREFIXES.originals, sniffed.ext);
  // Written directly from the already-downloaded, verified `buffer` —
  // never a server-side CopyObject — since some S3-compatible providers
  // (and cross-account/cross-bucket setups) reject CopyObject with
  // "MissingParameter: CopySource" depending on how the source key is
  // addressed. Writing the bytes we already verified sidesteps that
  // entirely. The temp object is only ever deleted (best-effort) after
  // this write has confirmed success, so a failure here leaves both the
  // temp object and a PENDING upload session in place for retry.
  await s3StorageProvider.putObjectBuffer(originalKey, buffer, sniffedMimeType);
  await s3StorageProvider.deleteObject(session.storageKey).catch((error) => {
    console.error("Failed to remove temp upload object after writing to originals/:", error);
  });

  const originalChecksum = sha256Hex(buffer);

  const { fileId, workspaceId } = session.targetFileId
    ? await completeVersionUpload(session, { originalKey, originalChecksum, sniffedMimeType, objectMeta, creator })
    : await completeNewFileUpload(session, { originalKey, originalChecksum, fileKind, sniffedMimeType, objectMeta, creator });

  logUploadTiming({ correlationId: session.timingCorrelationId, stage: "complete_upload_finished", fileId });
  return { fileId, workspaceId, timingCorrelationId: session.timingCorrelationId };
}

interface CompleteUploadCommon {
  originalKey: string;
  originalChecksum: string;
  sniffedMimeType: string;
  objectMeta: { sizeBytes: number };
  creator: { id: string; name: string };
}

async function completeNewFileUpload(
  session: { id: string; workspaceId: string; declaredFileName: string; timingCorrelationId: string },
  { originalKey, originalChecksum, fileKind, sniffedMimeType, objectMeta, creator }: CompleteUploadCommon & { fileKind: FileKind },
): Promise<Pick<CompleteUploadResult, "fileId" | "workspaceId">> {
  return prisma.$transaction(async (tx) => {
    const file = await tx.workspaceFile.create({
      data: {
        workspaceId: session.workspaceId,
        displayName: session.declaredFileName,
        fileKind,
        mimeType: sniffedMimeType,
        sizeBytes: numberToStorageBigInt(objectMeta.sizeBytes),
        status: "UPLOADED",
      },
    });
    const version = await tx.fileVersion.create({
      data: {
        fileId: file.id,
        versionNumber: 1,
        originalStorageKey: originalKey,
        originalChecksum,
        originalSizeBytes: numberToStorageBigInt(objectMeta.sizeBytes),
        mimeType: sniffedMimeType,
      },
    });
    await tx.workspaceFile.update({
      where: { id: file.id },
      data: { currentVersionId: version.id, status: "PROCESSING" },
    });
    await tx.fileProcessingJob.create({ data: { fileVersionId: version.id, status: "PENDING", attempts: 1, timingCorrelationId: session.timingCorrelationId } });
    await tx.uploadSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await recordActivity(tx, {
      action: ActivityAction.FILE_UPLOADED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: session.workspaceId,
      metadata: { fileName: session.declaredFileName },
    });
    logUploadTiming({ correlationId: session.timingCorrelationId, stage: "processing_job_created", fileId: file.id });
    return { fileId: file.id, workspaceId: session.workspaceId };
  }).then((result) => {
    wakeWorker("file", session.timingCorrelationId);
    return result;
  });
}

/**
 * Creates a new FileVersion for an *existing* file (re-upload). The
 * previous current version is left completely untouched —
 * `WorkspaceFile.currentVersionId`/`status` are not written here at all;
 * only `pendingVersionId` points at the new candidate. Version numbers are
 * sequential and race-safe via `@@unique([fileId, versionNumber])` — a
 * concurrent duplicate assignment fails the transaction outright rather
 * than silently producing two versions with the same number.
 */
async function completeVersionUpload(
  session: { id: string; workspaceId: string; declaredFileName: string; targetFileId: string | null; timingCorrelationId: string },
  { originalKey, originalChecksum, sniffedMimeType, objectMeta, creator }: CompleteUploadCommon,
): Promise<Pick<CompleteUploadResult, "fileId" | "workspaceId">> {
  const targetFileId = session.targetFileId!;

  return prisma.$transaction(async (tx) => {
    const maxVersion = await tx.fileVersion.aggregate({
      where: { fileId: targetFileId },
      _max: { versionNumber: true },
    });
    const nextVersionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

    const version = await tx.fileVersion.create({
      data: {
        fileId: targetFileId,
        versionNumber: nextVersionNumber,
        originalStorageKey: originalKey,
        originalChecksum,
        originalSizeBytes: numberToStorageBigInt(objectMeta.sizeBytes),
        mimeType: sniffedMimeType,
        status: "PROCESSING",
      },
    });
    await tx.workspaceFile.update({
      where: { id: targetFileId },
      data: { pendingVersionId: version.id },
    });
    await tx.fileProcessingJob.create({ data: { fileVersionId: version.id, status: "PENDING", attempts: 1, timingCorrelationId: session.timingCorrelationId } });
    await tx.uploadSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await recordActivity(tx, {
      action: ActivityAction.FILE_VERSION_UPLOADED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: session.workspaceId,
      metadata: { fileName: session.declaredFileName, versionNumber: nextVersionNumber },
    });
    logUploadTiming({ correlationId: session.timingCorrelationId, stage: "processing_job_created", fileId: targetFileId });
    return { fileId: targetFileId, workspaceId: session.workspaceId };
  }).then((result) => {
    wakeWorker("file", session.timingCorrelationId);
    return result;
  });
}
