/**
 * Core claim/process logic for one file-processing job, factored out of
 * src/worker/process-files.ts (the long-lived entry point) so it can be
 * exercised directly by integration tests against the real test database
 * + MinIO — see src/data-access/files.integration.test.ts. Every function
 * here takes its Prisma client as a parameter rather than importing one,
 * so it stays usable from both the standalone worker script (its own
 * plain Node client, see process-files.ts) and from tests (the app's
 * `server-only`-mocked client under Vitest).
 */
import type { PrismaClient } from "../generated/prisma/client";
import { s3StorageProvider } from "../storage/s3-storage-provider";
import { generateStorageKey, STORAGE_PREFIXES } from "../storage/storage-keys";
import { generateWatermarkedPreview, UnsupportedImageError, ImageTooLargeError } from "../lib/image-preview";
import { sha256Hex } from "../lib/checksum";
import { isPreviewableFileKind } from "../lib/file-kind";
import { numberToStorageBigInt } from "../lib/bytes";
import { ActivityAction } from "../lib/activity-log";

const WORKER_ACTOR_NAME = "File Processing Worker";

export type PrismaLike = PrismaClient;

export type ClaimedJob = Awaited<ReturnType<typeof claimNextJob>>;

/** Atomically claims exactly one PENDING job via `FOR UPDATE SKIP LOCKED` — see process-files.ts's doc comment for why this pattern. */
export async function claimNextJob(prisma: PrismaLike) {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE file_processing_jobs
    SET status = 'PROCESSING', "startedAt" = now(), "updatedAt" = now()
    WHERE id = (
      SELECT id FROM file_processing_jobs
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  const jobId = claimed[0]?.id;
  if (!jobId) return null;

  return prisma.fileProcessingJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      fileVersion: {
        include: {
          file: { include: { workspace: { include: { client: true } } } },
        },
      },
    },
  });
}

interface SafeErrorSummary {
  code: string;
  message: string;
}

/** Never surfaces a raw Sharp/AWS SDK/Prisma error — see FILE_STORAGE_ARCHITECTURE.md "Security limitations." */
export function summarizeError(error: unknown): SafeErrorSummary {
  if (error instanceof ImageTooLargeError) {
    return { code: "IMAGE_TOO_LARGE", message: "This image exceeds the maximum supported dimensions." };
  }
  if (error instanceof UnsupportedImageError) {
    return { code: "UNSUPPORTED_IMAGE", message: "This image could not be processed into a preview." };
  }
  return { code: "PROCESSING_FAILED", message: "This file could not be processed. Please try again." };
}

async function recordWorkerActivity(
  prisma: PrismaLike,
  params: { action: string; creatorId: string; workspaceId: string; fileName: string },
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      action: params.action,
      actorType: "SYSTEM",
      actorName: WORKER_ACTOR_NAME,
      creatorId: params.creatorId,
      workspaceId: params.workspaceId,
      metadata: { fileName: params.fileName },
    },
  });
}

export async function markJobFailed(prisma: PrismaLike, job: NonNullable<ClaimedJob>, summary: SafeErrorSummary): Promise<void> {
  const file = job.fileVersion.file;
  await prisma.$transaction([
    prisma.fileProcessingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorCode: summary.code, errorMessage: summary.message, completedAt: new Date() },
    }),
    prisma.fileVersion.update({ where: { id: job.fileVersion.id }, data: { processingError: summary.message } }),
    prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "FAILED" } }),
  ]);
  await recordWorkerActivity(prisma, {
    action: ActivityAction.FILE_PROCESSING_FAILED,
    creatorId: file.workspace.creatorId,
    workspaceId: file.workspaceId,
    fileName: file.displayName,
  });
}

async function markNonPreviewableReady(prisma: PrismaLike, job: NonNullable<ClaimedJob>): Promise<void> {
  const file = job.fileVersion.file;
  await prisma.$transaction([
    prisma.fileProcessingJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "READY" } }),
  ]);
  await recordWorkerActivity(prisma, {
    action: ActivityAction.FILE_PROCESSING_COMPLETED,
    creatorId: file.workspace.creatorId,
    workspaceId: file.workspaceId,
    fileName: file.displayName,
  });
}

async function processImageJob(prisma: PrismaLike, job: NonNullable<ClaimedJob>): Promise<void> {
  const version = job.fileVersion;
  const file = version.file;
  const { workspace } = file;
  const { client } = workspace;

  const originalBuffer = await s3StorageProvider.getObjectBuffer(version.originalStorageKey);
  const preview = await generateWatermarkedPreview(originalBuffer, {
    clientName: client.name,
    clientEmail: client.email,
    workspaceTitle: workspace.title,
  });

  const previewKey = generateStorageKey(STORAGE_PREFIXES.previews, "jpg");
  await s3StorageProvider.putObjectBuffer(previewKey, preview.buffer, preview.mimeType);
  const previewChecksum = sha256Hex(preview.buffer);

  await prisma.$transaction([
    prisma.fileVersion.update({
      where: { id: version.id },
      data: {
        previewStorageKey: previewKey,
        previewChecksum,
        previewSizeBytes: numberToStorageBigInt(preview.buffer.byteLength),
        width: preview.width,
        height: preview.height,
        processingError: null,
      },
    }),
    prisma.fileProcessingJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "READY" } }),
  ]);
  await recordWorkerActivity(prisma, {
    action: ActivityAction.FILE_PROCESSING_COMPLETED,
    creatorId: workspace.creatorId,
    workspaceId: file.workspaceId,
    fileName: file.displayName,
  });
}

/**
 * Processes exactly one claimed job to completion or failure. Every job
 * is attempted exactly once — see process-files.ts's doc comment on why
 * retries beyond that are a distinct, creator-triggered action rather
 * than an automatic in-worker requeue.
 */
export async function processJob(prisma: PrismaLike, job: NonNullable<ClaimedJob>): Promise<void> {
  const { file } = job.fileVersion;
  try {
    if (!isPreviewableFileKind(file.fileKind)) {
      await markNonPreviewableReady(prisma, job);
      return;
    }
    await processImageJob(prisma, job);
  } catch (error) {
    console.error(`[worker] Job ${job.id} (file ${file.id}) failed:`, error);
    await markJobFailed(prisma, job, summarizeError(error));
  }
}
