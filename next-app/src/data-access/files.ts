import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace, requireOwnedWorkspaceFile } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { bigIntToDisplayNumber } from "@/lib/bytes";
import { isPreviewableFileKind } from "@/lib/file-kind";
import { getWorkerConfig } from "@/storage/storage-config";
import { s3StorageProvider } from "@/storage/s3-storage-provider";
import { createPreviewPresignedUrl } from "@/storage/signed-urls";
import { FINANCIAL_LOCK_STATUSES } from "./workspaces";
import { wakeWorker } from "@/lib/worker-wake";
import type { FileKind, FileStatus } from "@/generated/prisma/client";

export class FileNotRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileNotRetryableError";
  }
}

export class FileNotDeletableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileNotDeletableError";
  }
}

export class PreviewUnavailableError extends Error {
  constructor(message = "A preview isn't available for this file.") {
    super(message);
    this.name = "PreviewUnavailableError";
  }
}

export interface WorkspaceFileVersionSummary {
  id: string;
  versionNumber: number;
  status: string;
  submittedAt: string | null;
  createdAt: string;
}

export interface WorkspaceFileListItem {
  id: string;
  displayName: string;
  fileKind: FileKind;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  previewAvailable: boolean;
  width: number | null;
  height: number | null;
  processingError: string | null;
  attempts: number;
  canRetry: boolean;
  canDelete: boolean;
  canUploadNewVersion: boolean;
  currentVersionNumber: number | null;
  /** The in-flight or failed re-upload candidate, if any — see WorkspaceFile.pendingVersionId. Never exposed to the client portal. */
  pendingVersion: { id: string; versionNumber: number; status: string; processingError: string | null } | null;
  /** Complete owned version history — READY/PROCESSING/FAILED, current, and submitted-to-client state for each. */
  versions: WorkspaceFileVersionSummary[];
}

/** Every non-deleted file for a workspace the authenticated creator owns, newest-first within manual sort order. */
export async function getWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileListItem[]> {
  const { workspace } = await requireOwnedWorkspace(workspaceId);
  const { maxAttempts } = getWorkerConfig();

  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      currentVersion: { include: { processingJobs: { orderBy: { createdAt: "desc" }, take: 1 } } },
      pendingVersion: true,
      versions: { orderBy: { versionNumber: "asc" } },
    },
  });

  const financiallyLocked = (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(workspace.status);
  const hasApprovedApproval = await prisma.workspaceApproval.count({ where: { workspaceId, status: "APPROVED" } });

  return files.map((file) => {
    const latestJob = file.currentVersion?.processingJobs[0];
    const attempts = latestJob?.attempts ?? 0;

    return {
      id: file.id,
      displayName: file.displayName,
      fileKind: file.fileKind,
      mimeType: file.mimeType,
      sizeBytes: bigIntToDisplayNumber(file.sizeBytes),
      status: file.status,
      sortOrder: file.sortOrder,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      previewAvailable:
        file.status === "READY" && isPreviewableFileKind(file.fileKind) && Boolean(file.currentVersion?.previewStorageKey),
      width: file.currentVersion?.width ?? null,
      height: file.currentVersion?.height ?? null,
      processingError: file.currentVersion?.processingError ?? null,
      attempts,
      canRetry: file.status === "FAILED" && attempts < maxAttempts,
      canDelete: !financiallyLocked,
      canUploadNewVersion:
        !financiallyLocked &&
        hasApprovedApproval === 0 &&
        !["CANCELLED", "DELIVERED"].includes(workspace.status) &&
        file.pendingVersionId === null,
      currentVersionNumber: file.currentVersion?.versionNumber ?? null,
      pendingVersion: file.pendingVersion
        ? {
            id: file.pendingVersion.id,
            versionNumber: file.pendingVersion.versionNumber,
            status: file.pendingVersion.status,
            processingError: file.pendingVersion.processingError,
          }
        : null,
      versions: file.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        status: v.status,
        submittedAt: v.submittedAt ? v.submittedAt.toISOString() : null,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  });
}

/**
 * Issues a short-lived preview URL for an owned, ready, previewable file.
 * Never resolves an original — only ever `currentVersion.previewStorageKey`.
 */
export async function getOwnedFilePreviewUrl(fileId: string): Promise<string> {
  const { file } = await requireOwnedWorkspaceFile(fileId);
  if (file.status !== "READY" || !file.currentVersion?.previewStorageKey) {
    throw new PreviewUnavailableError();
  }
  return createPreviewPresignedUrl(file.currentVersion.previewStorageKey);
}

/** Re-queues processing for a failed file, up to the configured attempt limit. */
export async function retryFileProcessing(fileId: string): Promise<void> {
  const { creator, file } = await requireOwnedWorkspaceFile(fileId);
  if (file.status !== "FAILED" || !file.currentVersion) {
    throw new FileNotRetryableError("Only a failed file can be retried.");
  }

  const { maxAttempts } = getWorkerConfig();
  const lastJob = await prisma.fileProcessingJob.findFirst({
    where: { fileVersionId: file.currentVersion.id },
    orderBy: { createdAt: "desc" },
  });
  if (lastJob && lastJob.attempts >= maxAttempts) {
    throw new FileNotRetryableError("This file has reached its maximum retry attempts.");
  }

  const currentVersionId = file.currentVersion.id;

  await prisma.$transaction(async (tx) => {
    await tx.fileProcessingJob.create({
      data: { fileVersionId: currentVersionId, status: "PENDING", attempts: (lastJob?.attempts ?? 0) + 1 },
    });
    await tx.workspaceFile.update({ where: { id: file.id }, data: { status: "PROCESSING" } });
    await tx.fileVersion.update({ where: { id: currentVersionId }, data: { processingError: null } });
    await recordActivity(tx, {
      action: ActivityAction.FILE_PROCESSING_RETRIED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: file.workspaceId,
      metadata: { fileName: file.displayName },
    });
  });

  wakeWorker("file");
}

/**
 * Soft-deletes a file (never for a financially-locked workspace — see
 * FINANCIAL_LOCK_STATUSES) and best-effort removes its storage objects.
 * A storage-deletion failure is logged but never rolls back or blocks the
 * already-committed database deletion — see FILE_STORAGE_ARCHITECTURE.md
 * "Deletion behavior."
 */
export async function deleteOwnedFile(fileId: string): Promise<void> {
  const { creator, file } = await requireOwnedWorkspaceFile(fileId);
  if ((FINANCIAL_LOCK_STATUSES as readonly string[]).includes(file.workspace.status)) {
    throw new FileNotDeletableError("Files cannot be removed once a workspace is paid or delivered.");
  }

  const versions = await prisma.fileVersion.findMany({
    where: { fileId },
    select: { originalStorageKey: true, previewStorageKey: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.workspaceFile.update({ where: { id: fileId }, data: { status: "DELETED", deletedAt: new Date() } });
    await recordActivity(tx, {
      action: ActivityAction.FILE_DELETED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: file.workspaceId,
      metadata: { fileName: file.displayName },
    });
  });

  const deletions = await Promise.allSettled(
    versions.flatMap((version) => [
      s3StorageProvider.deleteObject(version.originalStorageKey),
      ...(version.previewStorageKey ? [s3StorageProvider.deleteObject(version.previewStorageKey)] : []),
    ]),
  );
  for (const result of deletions) {
    if (result.status === "rejected") {
      console.error("Failed to delete a storage object for a removed file (DB delete already committed):", result.reason);
    }
  }
}
