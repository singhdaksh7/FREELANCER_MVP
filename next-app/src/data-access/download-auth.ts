import "server-only";
import { prisma } from "@/lib/prisma";
import { hashDownloadToken, isValidDownloadTokenShape } from "@/lib/download-token";

/**
 * Token-authorized secure-download access — a completely separate trust
 * path from both creator sessions and review tokens. See
 * SECURE_DOWNLOAD_ARCHITECTURE.md "Original authorization." A review
 * token can never be used here (different token space, different table),
 * and a download token can never be used to reach the review portal.
 */

export class InvalidDownloadTokenError extends Error {
  constructor(message = "This download link is not valid.") {
    super(message);
    this.name = "InvalidDownloadTokenError";
  }
}

export class DownloadGrantExpiredError extends Error {
  constructor(message = "This download link has expired.") {
    super(message);
    this.name = "DownloadGrantExpiredError";
  }
}

export class DownloadGrantRevokedError extends Error {
  constructor(message = "This download link has been revoked.") {
    super(message);
    this.name = "DownloadGrantRevokedError";
  }
}

export class DownloadGrantExhaustedError extends Error {
  constructor(message = "This download link has reached its download limit.") {
    super(message);
    this.name = "DownloadGrantExhaustedError";
  }
}

export interface DownloadGrantFileSummary {
  workspaceFileId: string;
  fileVersionId: string;
  displayName: string;
  sizeBytes: number;
}

export interface DownloadContext {
  grantId: string;
  workspaceId: string;
  /** null for APPROVAL_ONLY grants — no Payment exists in that mode. */
  paymentId: string | null;
  approvalId: string;
  expiresAt: string;
  maxDownloads: number;
  downloadCount: number;
  files: DownloadGrantFileSummary[];
  bundleReady: boolean;
  workspace: { title: string; creatorName: string };
  /** null for APPROVAL_ONLY grants — no Payment/gateway reference exists in that mode. */
  paymentReference: string | null;
}

/**
 * Validates a raw download token and returns grant-scoped context — never
 * exposes storageKey/tokenHash/gateway details. Shape checked before any
 * database access; expiry/exhaustion are checked lazily here (same
 * pattern as authorizeReviewToken), independent of the stored `status`
 * column.
 */
export async function authorizeDownloadGrant(rawToken: string): Promise<DownloadContext> {
  if (!isValidDownloadTokenShape(rawToken)) {
    throw new InvalidDownloadTokenError();
  }

  const tokenHash = hashDownloadToken(rawToken);
  const grant = await prisma.downloadGrant.findUnique({
    where: { tokenHash },
    include: {
      workspace: { select: { title: true, creator: { select: { name: true } } } },
      payment: { select: { id: true, gatewayPaymentId: true } },
      // DeliveryBundle is keyed off the approval, not the payment, so this
      // resolves for APPROVAL_ONLY grants (no Payment row) too. One-to-one
      // — DeliveryBundle.approvalId is @unique.
      approval: { select: { deliveryBundle: { select: { status: true } } } },
      files: true,
    },
  });

  if (!grant) throw new InvalidDownloadTokenError();
  if (grant.status === "REVOKED") throw new DownloadGrantRevokedError();
  if (grant.status === "EXPIRED" || grant.expiresAt <= new Date()) throw new DownloadGrantExpiredError();
  if (grant.status === "EXHAUSTED" || grant.downloadCount >= grant.maxDownloads) throw new DownloadGrantExhaustedError();

  return {
    grantId: grant.id,
    workspaceId: grant.workspaceId,
    paymentId: grant.paymentId,
    approvalId: grant.approvalId,
    expiresAt: grant.expiresAt.toISOString(),
    maxDownloads: grant.maxDownloads,
    downloadCount: grant.downloadCount,
    files: grant.files.map((f) => ({
      workspaceFileId: f.workspaceFileId,
      fileVersionId: f.fileVersionId,
      displayName: f.displayName,
      sizeBytes: Number(f.sizeBytes),
    })),
    bundleReady: grant.approval.deliveryBundle?.status === "READY",
    workspace: { title: grant.workspace.title, creatorName: grant.workspace.creator.name },
    paymentReference: grant.payment ? (grant.payment.gatewayPaymentId ?? grant.payment.id) : null,
  };
}
