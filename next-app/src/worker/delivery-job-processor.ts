/**
 * Core claim/process logic for one delivery-bundle-build job — the
 * secure-download counterpart to src/worker/job-processor.ts. Every
 * function takes its Prisma client as a parameter (never imports one), so
 * it works from both the standalone worker entry point
 * (process-deliveries.ts) and from integration tests. See
 * SECURE_DOWNLOAD_ARCHITECTURE.md "ZIP worker."
 */
import JSZip from "jszip";
import type { PrismaClient } from "../generated/prisma/client";
import { s3StorageProvider } from "../storage/s3-storage-provider";
import { generateDeliveryBundleKey } from "../storage/storage-keys";
import { getDeliveryWorkerConfig, getDownloadGrantConfig } from "../storage/storage-config";
import { sha256Hex } from "../lib/checksum";
import { numberToStorageBigInt } from "../lib/bytes";
import { buildUniqueZipEntryNames } from "../lib/zip-entry-name";
import { generateDownloadToken, hashDownloadToken, downloadTokenPrefix } from "../lib/download-token";
import { ActivityAction } from "../lib/activity-log";
import { assertWorkspaceTransition } from "../lib/workspace-transitions";

const WORKER_ACTOR_NAME = "Delivery Worker";

export type PrismaLike = PrismaClient;
export type ClaimedDeliveryJob = Awaited<ReturnType<typeof claimNextDeliveryJob>>;

type ApprovalSnapshotEntry = { workspaceFileId: string; fileVersionId: string; displayName: string; versionNumber: number };

/** Atomically claims exactly one PENDING delivery job via `FOR UPDATE SKIP LOCKED`. */
export async function claimNextDeliveryJob(prisma: PrismaLike) {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE delivery_bundle_jobs
    SET status = 'PROCESSING', "startedAt" = now(), "updatedAt" = now()
    WHERE id = (
      SELECT id FROM delivery_bundle_jobs
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  const jobId = claimed[0]?.id;
  if (!jobId) return null;

  return prisma.deliveryBundleJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      deliveryBundle: {
        include: {
          workspace: { select: { id: true, creatorId: true } },
          payment: { select: { id: true } },
        },
      },
    },
  });
}

async function markJobFailed(prisma: PrismaLike, job: NonNullable<ClaimedDeliveryJob>, message: string): Promise<void> {
  const bundle = job.deliveryBundle;
  await prisma.$transaction([
    prisma.deliveryBundleJob.update({
      where: { id: job.id },
      data: { status: "FAILED", processingError: message, completedAt: new Date() },
    }),
    prisma.deliveryBundle.update({
      where: { id: bundle.id },
      data: { status: "FAILED", processingError: message },
    }),
  ]);
  await prisma.activityLog.create({
    data: {
      action: ActivityAction.DELIVERY_PREPARATION_FAILED,
      actorType: "SYSTEM",
      actorName: WORKER_ACTOR_NAME,
      creatorId: bundle.workspace.creatorId,
      workspaceId: bundle.workspaceId,
    },
  });
}

/**
 * Downloads every approved original from storage, builds a ZIP with
 * sanitized, unique, flat entry names (no path traversal is possible —
 * every entry name comes from buildUniqueZipEntryNames, never a raw
 * caller-controlled path), uploads it privately, creates one
 * DownloadGrant + its file snapshot, and moves the workspace to
 * FILES_UNLOCKED. Verifies every snapshot file/version still exists and
 * belongs to this workspace before trusting it — the immutable approval
 * snapshot is re-validated, not blindly replayed.
 */
export async function processDeliveryJob(prisma: PrismaLike, job: NonNullable<ClaimedDeliveryJob>): Promise<void> {
  const bundle = job.deliveryBundle;

  try {
    const approval = await prisma.workspaceApproval.findUniqueOrThrow({ where: { id: bundle.approvalId } });
    const snapshot = approval.approvedFileVersionSnapshot as unknown as ApprovalSnapshotEntry[];

    if (snapshot.length === 0) {
      throw new Error("The approved file snapshot for this project is empty.");
    }

    const versions = await prisma.fileVersion.findMany({
      where: { id: { in: snapshot.map((e) => e.fileVersionId) } },
      include: { file: { select: { id: true, workspaceId: true, deletedAt: true } } },
    });
    const versionById = new Map(versions.map((v) => [v.id, v]));

    const resolved = snapshot.map((entry) => {
      const version = versionById.get(entry.fileVersionId);
      if (
        !version ||
        version.fileId !== entry.workspaceFileId ||
        version.file.workspaceId !== bundle.workspaceId ||
        version.file.deletedAt !== null
      ) {
        throw new Error(`Approved file "${entry.displayName}" is no longer available.`);
      }
      return { entry, version };
    });

    const entryNames = buildUniqueZipEntryNames(resolved.map((r) => r.entry.displayName));

    const zip = new JSZip();
    for (let i = 0; i < resolved.length; i++) {
      const { version } = resolved[i]!;
      const buffer = await s3StorageProvider.getObjectBuffer(version.originalStorageKey);
      zip.file(entryNames[i]!, buffer);
    }
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    const { bundlePrefix } = getDeliveryWorkerConfig();
    const bundleKey = generateDeliveryBundleKey(bundlePrefix);
    await s3StorageProvider.putObjectBuffer(bundleKey, zipBuffer, "application/zip");
    const checksum = sha256Hex(zipBuffer);

    const { ttlSeconds, maxDownloads } = getDownloadGrantConfig();
    // A throwaway initial token — hashed and immediately discarded. Never
    // exposed to any client; it exists only to satisfy tokenHash's unique
    // constraint until the client's master review portal claims a real,
    // single-use session via claimDownloadSession (which rotates this
    // hash on every claim). See SECURE_DOWNLOAD_ARCHITECTURE.md "Handoff
    // without email (Phase 7.5 redesign)."
    const throwawayToken = generateDownloadToken();
    const tokenHash = hashDownloadToken(throwawayToken);
    const tokenPrefix = downloadTokenPrefix(throwawayToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.deliveryBundle.update({
        where: { id: bundle.id },
        data: {
          status: "READY",
          storageKey: bundleKey,
          checksum,
          sizeBytes: numberToStorageBigInt(zipBuffer.byteLength),
          completedAt: new Date(),
          processingError: null,
        },
      });
      await tx.deliveryBundleJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });

      const grant = await tx.downloadGrant.create({
        data: {
          workspaceId: bundle.workspaceId,
          paymentId: bundle.paymentId,
          approvalId: bundle.approvalId,
          tokenHash,
          tokenPrefix,
          expiresAt,
          maxDownloads,
        },
      });
      await tx.downloadGrantFile.createMany({
        data: resolved.map(({ entry, version }) => ({
          grantId: grant.id,
          workspaceFileId: entry.workspaceFileId,
          fileVersionId: entry.fileVersionId,
          displayName: entry.displayName,
          sizeBytes: version.originalSizeBytes,
        })),
      });

      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: bundle.workspaceId },
        select: { status: true, deliveryMode: true },
      });
      if (workspace.status === "PAID" || workspace.status === "AWAITING_CREATOR_RELEASE") {
        assertWorkspaceTransition(workspace.status, "FILES_UNLOCKED", workspace.deliveryMode);
        await tx.workspace.update({ where: { id: bundle.workspaceId }, data: { status: "FILES_UNLOCKED" } });
      }

      await tx.activityLog.create({
        data: {
          action: ActivityAction.FILES_UNLOCKED,
          actorType: "SYSTEM",
          actorName: WORKER_ACTOR_NAME,
          creatorId: bundle.workspace.creatorId,
          workspaceId: bundle.workspaceId,
          metadata: { fileCount: resolved.length },
        },
      });
    });
  } catch (error) {
    console.error(`[delivery-worker] Job ${job.id} (bundle ${bundle.id}) failed:`, error);
    const message = error instanceof Error ? error.message : "Delivery preparation failed.";
    await markJobFailed(prisma, job, message);
  }
}
