import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { generateStorageKey, STORAGE_PREFIXES } from "@/storage/storage-keys";
import { createUploadPresignedUrl } from "@/storage/signed-urls";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { getUploadLimits } from "@/storage/storage-config";
import { isSupportedMimeType, mimeTypeToFileKind } from "@/lib/file-kind";
import { sanitizeDisplayFileName, extensionHintFromFileName } from "@/lib/filename-sanitize";
import { bigIntToDisplayNumber, numberToStorageBigInt } from "@/lib/bytes";
import { sha256Hex } from "@/lib/checksum";

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

  return { sessionId: session.id, uploadUrl: url, expiresAt: expiresAt.toISOString() };
}

export interface CompleteUploadResult {
  fileId: string;
}

/**
 * Steps 7-11 of the secure upload workflow: verifies the browser actually
 * uploaded the declared object (existence + exact size via server-side
 * `headObject`, then real content-type via magic-byte sniffing of the
 * downloaded bytes — never the browser-declared MIME type), moves it into
 * `originals/` under a **new** random key (the temp key is never reused
 * as the permanent one), and creates the WorkspaceFile/FileVersion/
 * FileProcessingJob row set the worker will pick up.
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
  await s3StorageProvider.copyObject(session.storageKey, originalKey);
  await s3StorageProvider.deleteObject(session.storageKey).catch((error) => {
    console.error("Failed to remove temp upload object after copy to originals/:", error);
  });

  const originalChecksum = sha256Hex(buffer);

  const { fileId } = await prisma.$transaction(async (tx) => {
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
    await tx.fileProcessingJob.create({ data: { fileVersionId: version.id, status: "PENDING", attempts: 1 } });
    await tx.uploadSession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await recordActivity(tx, {
      action: ActivityAction.FILE_UPLOADED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: session.workspaceId,
      metadata: { fileName: session.declaredFileName },
    });
    return { fileId: file.id };
  });

  return { fileId };
}
