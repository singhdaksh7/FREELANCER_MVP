import "server-only";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import type { DownloadContext } from "./download-auth";
import { DownloadGrantExpiredError, DownloadGrantExhaustedError, DownloadGrantRevokedError } from "./download-auth";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";
import { createOriginalDownloadPresignedUrl, createDeliveryBundlePresignedUrl } from "@/storage/signed-urls";
import { sanitizeDisplayFileName, buildContentDisposition } from "@/lib/filename-sanitize";
import { generateDownloadToken, hashDownloadToken, downloadTokenPrefix } from "@/lib/download-token";
import type { ReviewContext } from "./review-auth";

/**
 * Individual/bundle secure-original download — see
 * SECURE_DOWNLOAD_ARCHITECTURE.md "Original authorization" and "Download
 * logging." Every function here re-verifies grant status/expiry/limit
 * fresh inside its own transaction (never trusts the DownloadContext
 * snapshot alone, which could be stale by the time the actual download
 * request lands) and atomically records the download alongside
 * incrementing the counter — a failed authorization is never counted.
 */

export class FileNotInGrantError extends Error {
  constructor(message = "This file is not part of your download grant.") {
    super(message);
    this.name = "FileNotInGrantError";
  }
}

export class BundleNotReadyError extends Error {
  constructor(message = "Your delivery bundle is still being prepared. Please check back shortly.") {
    super(message);
    this.name = "BundleNotReadyError";
  }
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

/** Re-verifies grant freshness (status/expiry/limit) and atomically increments the download counter + logs the download, all in one transaction — the only place a download is ever actually counted. */
async function claimOneDownload(
  grantId: string,
  entry: { workspaceFileId: string | null; fileVersionId: string | null; downloadType: "INDIVIDUAL" | "BUNDLE" },
  requestMeta: { userAgent: string | null; ip: string | null },
): Promise<{ workspaceId: string }> {
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.downloadGrant.findUniqueOrThrow({ where: { id: grantId } });
    if (fresh.status === "REVOKED") throw new DownloadGrantRevokedError();
    if (fresh.status === "EXPIRED" || fresh.expiresAt <= new Date()) throw new DownloadGrantExpiredError();
    if (fresh.status === "EXHAUSTED" || fresh.downloadCount >= fresh.maxDownloads) throw new DownloadGrantExhaustedError();

    const newCount = fresh.downloadCount + 1;
    await tx.downloadGrant.update({
      where: { id: fresh.id },
      data: { downloadCount: newCount, status: newCount >= fresh.maxDownloads ? "EXHAUSTED" : "ACTIVE" },
    });
    await tx.downloadLog.create({
      data: {
        grantId: fresh.id,
        workspaceFileId: entry.workspaceFileId,
        fileVersionId: entry.fileVersionId,
        downloadType: entry.downloadType,
        userAgent: requestMeta.userAgent?.slice(0, 500) ?? null,
        ipHash: hashIp(requestMeta.ip),
      },
    });

    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: fresh.workspaceId },
      select: { id: true, status: true, deliveryMode: true },
    });
    let justDelivered = false;
    if (workspace.status === "FILES_UNLOCKED") {
      assertWorkspaceTransition("FILES_UNLOCKED", "DELIVERED", workspace.deliveryMode);
      await tx.workspace.update({ where: { id: workspace.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
      justDelivered = true;
    }

    await recordActivity(tx, {
      action: entry.downloadType === "INDIVIDUAL" ? ActivityAction.FILE_DOWNLOADED : ActivityAction.BUNDLE_DOWNLOADED,
      actorType: "CLIENT",
      actorName: "Client",
      workspaceId: workspace.id,
    });
    if (justDelivered) {
      await recordActivity(tx, {
        action: ActivityAction.REVIEW_LINK_READ_ONLY,
        actorType: "SYSTEM",
        actorName: "System",
        workspaceId: workspace.id,
      });
    }

    return { workspaceId: workspace.id };
  });
}

export interface OriginalDownloadResult {
  url: string;
  filename: string;
}

/** Individual original-file download — the requested fileId must be one of THIS grant's immutable, approved files; never any newer/unapproved version, never the review-token preview path. */
export async function downloadOriginalFile(
  context: DownloadContext,
  workspaceFileId: string,
  requestMeta: { userAgent: string | null; ip: string | null },
): Promise<OriginalDownloadResult> {
  const grantFile = context.files.find((f) => f.workspaceFileId === workspaceFileId);
  if (!grantFile) throw new FileNotInGrantError();

  const version = await prisma.fileVersion.findUnique({
    where: { id: grantFile.fileVersionId },
    select: { id: true, fileId: true, originalStorageKey: true, mimeType: true },
  });
  if (!version || version.fileId !== workspaceFileId) throw new FileNotInGrantError();

  await claimOneDownload(context.grantId, { workspaceFileId, fileVersionId: version.id, downloadType: "INDIVIDUAL" }, requestMeta);

  const filename = sanitizeDisplayFileName(grantFile.displayName);
  const url = await createOriginalDownloadPresignedUrl(version.originalStorageKey, buildContentDisposition(filename));
  return { url, filename };
}

export interface BundleDownloadResult {
  url: string;
}

/** Full delivery-bundle ZIP download — requires the DeliveryBundle to be READY; never issues a URL for a pending/partial bundle. */
export async function downloadBundle(
  context: DownloadContext,
  requestMeta: { userAgent: string | null; ip: string | null },
): Promise<BundleDownloadResult> {
  // Keyed off approvalId, not paymentId — an APPROVAL_ONLY grant's bundle
  // has no Payment row at all (paymentId is nullable and Postgres treats
  // NULL as distinct across rows, so a paymentId lookup would be unsafe).
  // approvalId isn't @unique (one approval could in principle be retried
  // into a second bundle after a failure), so take the most recent.
  const bundle = await prisma.deliveryBundle.findFirst({
    where: { approvalId: context.approvalId },
    orderBy: { createdAt: "desc" },
  });
  if (!bundle || bundle.status !== "READY" || !bundle.storageKey) {
    throw new BundleNotReadyError();
  }

  await claimOneDownload(context.grantId, { workspaceFileId: null, fileVersionId: null, downloadType: "BUNDLE" }, requestMeta);

  const bundleFilename = `${sanitizeDisplayFileName(context.workspace.title)}.zip`;
  const url = await createDeliveryBundlePresignedUrl(bundle.storageKey, buildContentDisposition(bundleFilename));
  return { url };
}

export class DownloadNotReadyError extends Error {
  constructor(message = "Your files are not unlocked yet.") {
    super(message);
    this.name = "DownloadNotReadyError";
  }
}

/**
 * Mints a fresh, single-use download-session URL for a client who is
 * already inside their own token-authorized master review portal — the
 * ONLY path by which a client ever reaches `/download/[token]` (Phase 7.5
 * security-gate fix: no raw download token is ever persisted, not even
 * transiently — see SECURE_DOWNLOAD_ARCHITECTURE.md "Handoff without
 * email (Phase 7.5 redesign)"). Rotates `DownloadGrant.tokenHash` on every
 * call — a previously issued /download/[token] link stops working the
 * moment a new one is claimed, which is fine, since the review portal is
 * always reachable again to claim a fresh one. Never counts as a download
 * itself (see claimOneDownload — a claim never writes a DownloadLog row).
 */
export async function claimDownloadSession(context: ReviewContext): Promise<string> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: context.workspaceId },
    select: { status: true },
  });
  if (workspace.status !== "FILES_UNLOCKED" && workspace.status !== "DELIVERED") {
    throw new DownloadNotReadyError();
  }

  // Looked up by workspaceId, not via Payment — an APPROVAL_ONLY grant has
  // no Payment row at all (paymentId is nullable there). One workspace
  // never has more than one active grant, so the most recent is correct
  // either way.
  const grant = await prisma.downloadGrant.findFirst({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!grant) throw new DownloadNotReadyError();

  const rawToken = generateDownloadToken();
  await prisma.downloadGrant.update({
    where: { id: grant.id },
    data: { tokenHash: hashDownloadToken(rawToken), tokenPrefix: downloadTokenPrefix(rawToken), claimedAt: new Date() },
  });

  return `/download/${rawToken}`;
}
