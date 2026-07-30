import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";
import { generateReviewToken, hashReviewToken, reviewTokenPrefix } from "@/lib/review-token";
import { getReviewLinkConfig } from "@/storage/storage-config";
import type { Prisma } from "@/generated/prisma/client";

export class ReviewLinkNotEligibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewLinkNotEligibleError";
  }
}

export class ReviewLinkNotFoundError extends Error {
  constructor(message = "No active review link exists for this workspace.") {
    super(message);
    this.name = "ReviewLinkNotFoundError";
  }
}

const UNRESOLVED_UPLOAD_STATUSES = ["UPLOAD_PENDING", "UPLOADING", "UPLOADED"] as const;

/**
 * Confirms a workspace is in a state where a secure review link can be
 * created/regenerated: not CANCELLED/DELIVERED, has at least one
 * non-deleted file, at least one file READY (covers both previewable
 * images and locked PDF/ZIP deliverables, since both reach FileStatus
 * "READY"), and no file left in an unresolved upload state that would
 * make the reviewed set misleading.
 */
async function assertReviewLinkEligible(workspaceId: string, workspaceStatus: string): Promise<void> {
  if (workspaceStatus === "CANCELLED") {
    throw new ReviewLinkNotEligibleError("A cancelled workspace cannot have a review link.");
  }
  if (workspaceStatus === "DELIVERED") {
    throw new ReviewLinkNotEligibleError("A delivered workspace cannot have a new review link.");
  }
  if (workspaceStatus === "CLOSED") {
    throw new ReviewLinkNotEligibleError("A closed workspace cannot have a new review link.");
  }

  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId, deletedAt: null },
    select: { status: true },
  });

  if (files.length === 0) {
    throw new ReviewLinkNotEligibleError("Upload at least one file before creating a review link.");
  }
  if (!files.some((f) => f.status === "READY")) {
    throw new ReviewLinkNotEligibleError("At least one file must finish processing before sharing a review link.");
  }
  if (files.some((f) => (UNRESOLVED_UPLOAD_STATUSES as readonly string[]).includes(f.status))) {
    throw new ReviewLinkNotEligibleError("Wait for uploads in progress to finish before sharing a review link.");
  }
}

export interface CreatedReviewLink {
  /** Shown to the creator exactly once — never retrievable again after this call returns. */
  rawToken: string;
  /** null for a project-duration link — see ReviewLinkConfig. */
  expiresAt: string | null;
}

/**
 * Marks every current READY-but-not-yet-submitted file version as
 * client-visible. Called from link creation/regeneration — but never while
 * CHANGES_REQUESTED, so a creator who uploads a new version for an
 * existing file (see WorkspaceFile.pendingVersionId) and then happens to
 * regenerate the link before clicking "Submit Revision" can't accidentally
 * bypass that explicit gate. A brand-new file uploaded mid-CHANGES_REQUESTED
 * still becomes visible once the creator does submit the revision —
 * submitRevision() sweeps every unsubmitted current version workspace-wide,
 * not just ones tied to the active change request.
 */
async function submitAllReadyCurrentVersions(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  const currentVersionIds = (
    await tx.workspaceFile.findMany({
      where: { workspaceId, deletedAt: null, currentVersionId: { not: null } },
      select: { currentVersionId: true },
    })
  )
    .map((f) => f.currentVersionId)
    .filter((id): id is string => id !== null);

  await tx.fileVersion.updateMany({
    where: { id: { in: currentVersionIds }, status: "READY", submittedAt: null },
    data: { submittedAt: new Date() },
  });
}

/**
 * Creates a new ACTIVE review link for an owned, eligible workspace. If the
 * workspace is still DRAFT, this call is what actually shares it (moves it
 * to IN_REVIEW). Either way — DRAFT or already IN_REVIEW — every current
 * READY file version not yet submitted becomes client-visible, so files
 * uploaded before the very first link exists (or added later while no
 * change request is open) are never silently invisible to the client.
 */
export async function createReviewLink(workspaceId: string): Promise<CreatedReviewLink> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);
  await assertReviewLinkEligible(workspaceId, workspace.status);

  const rawToken = generateReviewToken();
  const tokenHash = hashReviewToken(rawToken);
  const tokenPrefix = reviewTokenPrefix(rawToken);
  const { expiryDays } = getReviewLinkConfig();
  const expiresAt = expiryDays === null ? null : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.reviewLink.create({
      data: { workspaceId, tokenHash, tokenPrefix, expiresAt, createdById: creator.id },
    });

    if (workspace.status === "DRAFT") {
      assertWorkspaceTransition("DRAFT", "IN_REVIEW", workspace.deliveryMode);
      await tx.workspace.update({ where: { id: workspaceId }, data: { status: "IN_REVIEW" } });
    }

    if (workspace.status !== "CHANGES_REQUESTED") {
      await submitAllReadyCurrentVersions(tx, workspaceId);
    }

    await recordActivity(tx, {
      action: ActivityAction.REVIEW_LINK_CREATED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
      metadata: { tokenPrefix },
    });
  });

  return { rawToken, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}

/** Revokes the workspace's currently ACTIVE review link, if any. Old link stops working immediately (status check happens at authorization time). */
export async function revokeReviewLink(workspaceId: string): Promise<void> {
  const { creator } = await requireOwnedWorkspace(workspaceId);

  const active = await prisma.reviewLink.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!active) throw new ReviewLinkNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.reviewLink.update({ where: { id: active.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await recordActivity(tx, {
      action: ActivityAction.REVIEW_LINK_REVOKED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
    });
  });
}

/** Revokes the current active link (if any) and issues a brand-new one — the old token is never reused and stops working immediately. */
export async function regenerateReviewLink(workspaceId: string): Promise<CreatedReviewLink> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);
  await assertReviewLinkEligible(workspaceId, workspace.status);

  const rawToken = generateReviewToken();
  const tokenHash = hashReviewToken(rawToken);
  const tokenPrefix = reviewTokenPrefix(rawToken);
  const { expiryDays } = getReviewLinkConfig();
  const expiresAt = expiryDays === null ? null : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const previousActive = await tx.reviewLink.findFirst({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    const newLink = await tx.reviewLink.create({
      data: { workspaceId, tokenHash, tokenPrefix, expiresAt, createdById: creator.id },
    });

    if (previousActive) {
      await tx.reviewLink.update({
        where: { id: previousActive.id },
        data: { status: "REVOKED", revokedAt: new Date(), replacedById: newLink.id },
      });
    }

    if (workspace.status !== "CHANGES_REQUESTED") {
      await submitAllReadyCurrentVersions(tx, workspaceId);
    }

    await recordActivity(tx, {
      action: ActivityAction.REVIEW_LINK_REGENERATED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
      metadata: { tokenPrefix },
    });
  });

  return { rawToken, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}
