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
          file: { include: { workspace: true } },
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

/** True when this job's FileVersion is a re-upload candidate (not the file's original/promoted version) — see WorkspaceFile.pendingVersionId in schema.prisma. */
function isVersionUploadJob(job: NonNullable<ClaimedJob>): boolean {
  return job.fileVersion.file.pendingVersionId === job.fileVersion.id;
}

export async function markJobFailed(prisma: PrismaLike, job: NonNullable<ClaimedJob>, summary: SafeErrorSummary): Promise<void> {
  const file = job.fileVersion.file;
  const isVersionUpload = isVersionUploadJob(job);

  await prisma.$transaction([
    prisma.fileProcessingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorCode: summary.code, errorMessage: summary.message, completedAt: new Date() },
    }),
    prisma.fileVersion.update({
      where: { id: job.fileVersion.id },
      data: { processingError: summary.message, status: "FAILED" },
    }),
    // Version-upload failure: the candidate FileVersion is marked FAILED
    // above (pendingVersionId still points at it, so the creator UI can
    // show it), but the file's own status/currentVersionId are left
    // completely untouched — the previous current version stays active.
    ...(isVersionUpload ? [] : [prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "FAILED" as const } })]),
  ]);
  await recordWorkerActivity(prisma, {
    action: isVersionUpload ? ActivityAction.FILE_VERSION_PROCESSING_FAILED : ActivityAction.FILE_PROCESSING_FAILED,
    creatorId: file.workspace.creatorId,
    workspaceId: file.workspaceId,
    fileName: file.displayName,
  });
}

async function markNonPreviewableReady(prisma: PrismaLike, job: NonNullable<ClaimedJob>): Promise<void> {
  const file = job.fileVersion.file;
  const isVersionUpload = isVersionUploadJob(job);

  await prisma.$transaction([
    prisma.fileProcessingJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.fileVersion.update({ where: { id: job.fileVersion.id }, data: { status: "READY" } }),
    isVersionUpload
      ? prisma.workspaceFile.update({
          where: { id: file.id },
          data: { currentVersionId: job.fileVersion.id, pendingVersionId: null },
        })
      : prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "READY" } }),
  ]);
  await recordWorkerActivity(prisma, {
    action: isVersionUpload ? ActivityAction.FILE_VERSION_PROCESSING_COMPLETED : ActivityAction.FILE_PROCESSING_COMPLETED,
    creatorId: file.workspace.creatorId,
    workspaceId: file.workspaceId,
    fileName: file.displayName,
  });
}

/** First 8 chars of a cuid is plenty to correlate one job's log lines without logging anything that could double as a lookup key elsewhere (storage keys, tokens). */
function shortId(id: string): string {
  return id.slice(0, 8);
}

async function processImageJob(prisma: PrismaLike, job: NonNullable<ClaimedJob>, jobTag: string): Promise<void> {
  const version = job.fileVersion;
  const file = version.file;
  const { workspace } = file;

  const downloadStart = Date.now();
  const originalBuffer = await s3StorageProvider.getObjectBuffer(version.originalStorageKey);
  const downloadMs = Date.now() - downloadStart;
  console.log(
    `[file-worker] original downloaded job=${jobTag} sizeBytes=${originalBuffer.byteLength} durationMs=${downloadMs}`,
  );

  const previewStart = Date.now();
  const preview = await generateWatermarkedPreview(originalBuffer, {
    clientName: workspace.clientName,
    workspaceTitle: workspace.title,
  });
  const previewGenMs = Date.now() - previewStart;
  console.log(
    `[file-worker] preview generated job=${jobTag} width=${preview.width} height=${preview.height} durationMs=${previewGenMs}`,
  );

  const previewKey = generateStorageKey(STORAGE_PREFIXES.previews, "jpg");
  const uploadStart = Date.now();
  await s3StorageProvider.putObjectBuffer(previewKey, preview.buffer, preview.mimeType);
  const uploadMs = Date.now() - uploadStart;
  console.log(`[file-worker] preview uploaded job=${jobTag} sizeBytes=${preview.buffer.byteLength} durationMs=${uploadMs}`);

  const previewChecksum = sha256Hex(preview.buffer);
  const isVersionUpload = isVersionUploadJob(job);

  const dbStart = Date.now();
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
        status: "READY",
      },
    }),
    prisma.fileProcessingJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    isVersionUpload
      ? prisma.workspaceFile.update({
          where: { id: file.id },
          data: { currentVersionId: version.id, pendingVersionId: null },
        })
      : prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "READY" } }),
  ]);
  const dbMs = Date.now() - dbStart;
  console.log(`[file-worker] database updated job=${jobTag} durationMs=${dbMs}`);

  await recordWorkerActivity(prisma, {
    action: isVersionUpload ? ActivityAction.FILE_VERSION_PROCESSING_COMPLETED : ActivityAction.FILE_PROCESSING_COMPLETED,
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
 *
 * Logs safe, sanitized timing at each stage (see PART 7 of the upload/
 * processing-latency investigation this instrumentation was added for) —
 * job/file ids are truncated to 8 chars, never a storage key, signed URL,
 * token, or credential. This is what "job created -> worker claimed"
 * latency (`queueLatencyMs` below, from the job row's own createdAt/
 * startedAt — set by claimNextJob's `FOR UPDATE SKIP LOCKED` claim) and the
 * rest of the per-stage timings (download/generate/upload/db) are read
 * from directly in production logs.
 */
export async function processJob(prisma: PrismaLike, job: NonNullable<ClaimedJob>): Promise<void> {
  const { file } = job.fileVersion;
  const jobTag = shortId(job.id);
  const queueLatencyMs = job.startedAt ? job.startedAt.getTime() - job.createdAt.getTime() : null;
  console.log(
    `[file-worker] job claimed job=${jobTag} file=${shortId(file.id)} attempt=${job.attempts}` +
      (queueLatencyMs !== null ? ` queueLatencyMs=${queueLatencyMs}` : ""),
  );

  const totalStart = Date.now();
  try {
    if (!isPreviewableFileKind(file.fileKind)) {
      await markNonPreviewableReady(prisma, job);
      console.log(`[file-worker] job completed job=${jobTag} totalMs=${Date.now() - totalStart}`);
      return;
    }
    await processImageJob(prisma, job, jobTag);
    console.log(`[file-worker] job completed job=${jobTag} totalMs=${Date.now() - totalStart}`);
  } catch (error) {
    console.error(`[worker] Job ${job.id} (file ${file.id}) failed:`, error);
    await markJobFailed(prisma, job, summarizeError(error));
  }
}
