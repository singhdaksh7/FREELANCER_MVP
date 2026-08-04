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
import { FileKind } from "../generated/prisma/enums";
import { s3StorageProvider } from "../storage/s3-storage-provider";
import { generateStorageKey, STORAGE_PREFIXES } from "../storage/storage-keys";
import { generateWatermarkedPreview, generatePdfWatermarkedPreview, UnsupportedImageError, ImageTooLargeError } from "../lib/image-preview";
import { UnsupportedPdfError, PdfTooLargeError, PdfProcessingTimeoutError } from "../lib/pdf-preview";
import { sha256Hex } from "../lib/checksum";
import { isPreviewableFileKind } from "../lib/file-kind";
import { numberToStorageBigInt } from "../lib/bytes";
import { ActivityAction } from "../lib/activity-log";
import { getWorkerConfig } from "../storage/storage-config";

const WORKER_ACTOR_NAME = "File Processing Worker";
const STALE_PROCESSING_MESSAGE = "Processing did not complete — the worker may have restarted. Retry to try again.";

export type PrismaLike = PrismaClient;

export type ClaimedJob = Awaited<ReturnType<typeof claimNextJob>>;

/**
 * Reaps jobs left in PROCESSING past the configured lease (a worker
 * process that crashed or was restarted mid-job — e.g. a Render
 * free-tier spin-down/redeploy — never gets to call markJobFailed or
 * complete the job itself, so without this the file/version would stay
 * "Processing" forever). Marks each one FAILED with a clear message,
 * exactly like a normal in-process failure — never READY, never edited
 * outside this same code path, and the existing `canRetry`/attempts
 * accounting is untouched, so the normal Retry Processing button appears
 * whenever attempts remain. Runs before every claim attempt so a single
 * worker restart recovers on its very next poll.
 */
async function reapStaleProcessingJobs(prisma: PrismaLike): Promise<void> {
  const { processingLeaseMs } = getWorkerConfig();
  const cutoff = new Date(Date.now() - processingLeaseMs);

  // Atomically flip each stale job out of PROCESSING first (bounds a race
  // with another worker instance concurrently reaping/completing the same
  // row) — the returned ids are then safe to fan out the FileVersion/
  // WorkspaceFile/activity-log updates for.
  const staleJobs = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE file_processing_jobs
    SET status = 'FAILED', "errorCode" = 'STALE_PROCESSING', "errorMessage" = ${STALE_PROCESSING_MESSAGE}, "completedAt" = now(), "updatedAt" = now()
    WHERE status = 'PROCESSING' AND "startedAt" < ${cutoff}
    RETURNING id
  `;
  if (staleJobs.length === 0) return;

  for (const { id } of staleJobs) {
    const job = await prisma.fileProcessingJob.findUnique({
      where: { id },
      include: { fileVersion: { include: { file: { include: { workspace: true } } } } },
    });
    if (!job) continue;

    const file = job.fileVersion.file;
    const isVersionUpload = file.pendingVersionId === job.fileVersion.id;

    await prisma.$transaction([
      prisma.fileVersion.update({
        where: { id: job.fileVersion.id },
        data: { processingError: STALE_PROCESSING_MESSAGE, status: "FAILED" },
      }),
      ...(isVersionUpload ? [] : [prisma.workspaceFile.update({ where: { id: file.id }, data: { status: "FAILED" as const } })]),
    ]);
    await recordWorkerActivity(prisma, {
      action: isVersionUpload ? ActivityAction.FILE_VERSION_PROCESSING_FAILED : ActivityAction.FILE_PROCESSING_FAILED,
      creatorId: file.workspace.creatorId,
      workspaceId: file.workspaceId,
      fileName: file.displayName,
    });
  }
}

/** Atomically claims exactly one PENDING job via `FOR UPDATE SKIP LOCKED` — see process-files.ts's doc comment for why this pattern. */
export async function claimNextJob(prisma: PrismaLike) {
  await reapStaleProcessingJobs(prisma);

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
  if (error instanceof PdfTooLargeError) {
    return { code: "PDF_TOO_LARGE", message: error.message };
  }
  if (error instanceof PdfProcessingTimeoutError) {
    return { code: "PDF_TIMEOUT", message: "This PDF took too long to preview. Please try again." };
  }
  if (error instanceof UnsupportedPdfError) {
    return { code: "UNSUPPORTED_PDF", message: "This PDF could not be processed into a preview." };
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

interface GeneratedPreviewLike {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Shared "download original -> generate a watermarked preview -> upload ->
 * update DB" pipeline for every previewable FileKind. IMAGE and PDF only
 * differ in how the preview buffer itself is produced (Sharp directly vs.
 * pdf.js page-1 rasterization + Sharp) — everything else (storage keys,
 * checksum, transaction shape, activity log, timing logs) is identical,
 * so it lives here exactly once.
 */
async function processPreviewableJob(
  prisma: PrismaLike,
  job: NonNullable<ClaimedJob>,
  jobTag: string,
  generate: (originalBuffer: Buffer, workspace: { clientName: string; title: string }) => Promise<GeneratedPreviewLike>,
): Promise<void> {
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
  const preview = await generate(originalBuffer, workspace);
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

async function processImageJob(prisma: PrismaLike, job: NonNullable<ClaimedJob>, jobTag: string): Promise<void> {
  await processPreviewableJob(prisma, job, jobTag, (originalBuffer, workspace) =>
    generateWatermarkedPreview(originalBuffer, { clientName: workspace.clientName, workspaceTitle: workspace.title }),
  );
}

async function processPdfJob(prisma: PrismaLike, job: NonNullable<ClaimedJob>, jobTag: string): Promise<void> {
  await processPreviewableJob(prisma, job, jobTag, (originalBuffer, workspace) =>
    generatePdfWatermarkedPreview(originalBuffer, { clientName: workspace.clientName, workspaceTitle: workspace.title }),
  );
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
    if (file.fileKind === FileKind.PDF) {
      await processPdfJob(prisma, job, jobTag);
    } else {
      await processImageJob(prisma, job, jobTag);
    }
    console.log(`[file-worker] job completed job=${jobTag} totalMs=${Date.now() - totalStart}`);
  } catch (error) {
    console.error(`[worker] Job ${job.id} (file ${file.id}) failed:`, error);
    await markJobFailed(prisma, job, summarizeError(error));
  }
}
