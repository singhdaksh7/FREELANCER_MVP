import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace } from "./authorization";
import { requireAuthenticatedUser } from "./auth";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import type { ReviewContext } from "./review-auth";

export class CommentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentValidationError";
  }
}

export class CommentNotFoundError extends Error {
  constructor(message = "This comment could not be found.") {
    super(message);
    this.name = "CommentNotFoundError";
  }
}

export class ReviewPortalReadOnlyError extends Error {
  constructor(message = "This project is closed and its review portal is now read-only.") {
    super(message);
    this.name = "ReviewPortalReadOnlyError";
  }
}

/**
 * Terminal statuses after which the master review portal becomes
 * read-only for the client — see "Master review link behaviour" in
 * REQUIREMENTS_ALIGNMENT.md. DELIVERED covers PAYMENT_REQUIRED/
 * APPROVAL_ONLY once originals are handed over; CLOSED covers a
 * creator-closed PREVIEW_ONLY project. History remains visible either
 * way — only new mutations (comments/replies) are blocked.
 */
const READ_ONLY_WORKSPACE_STATUSES = ["DELIVERED", "CLOSED"] as const;

const MAX_BODY_LENGTH = 2000;
const MAX_NAME_LENGTH = 120;

function validateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new CommentValidationError("Comment cannot be empty.");
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new CommentValidationError(`Comments must be ${MAX_BODY_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

/** Normalized pin coordinates must both be present (or both absent) and within [0, 1] — see CLIENT_REVIEW_ARCHITECTURE.md "Comments and threads." */
export function validatePinCoordinates(pinX: number | undefined, pinY: number | undefined): void {
  if (pinX === undefined && pinY === undefined) return;
  if (pinX === undefined || pinY === undefined) {
    throw new CommentValidationError("Both pin coordinates are required together.");
  }
  if (!Number.isFinite(pinX) || !Number.isFinite(pinY) || pinX < 0 || pinX > 1 || pinY < 0 || pinY > 1) {
    throw new CommentValidationError("Pin coordinates must be normalized between 0 and 1.");
  }
}

interface CreateCommentInput {
  workspaceId: string;
  authorType: "CREATOR" | "CLIENT";
  creatorAuthorId?: string;
  actorName: string;
  reviewerName?: string;
  reviewerEmail?: string;
  body: string;
  workspaceFileId?: string;
  fileVersionId?: string;
  parentId?: string;
  pinX?: number;
  pinY?: number;
}

/** Enough safe, already-validated comment data for a caller to render the new comment/reply immediately, without a page reload or a follow-up read. */
export interface CreatedComment {
  id: string;
  parentId: string | null;
  authorType: "CREATOR" | "CLIENT";
  authorName: string;
  body: string;
  status: "OPEN";
  createdAt: string;
}

/**
 * Shared comment-creation core for both creator and client (token-holder)
 * comments — every association a caller supplies (file, version, parent)
 * is re-verified against `workspaceId` here, so neither an authenticated
 * creator nor a review token can smuggle a cross-workspace id through.
 */
async function createComment(input: CreateCommentInput): Promise<CreatedComment> {
  const body = validateBody(input.body);
  validatePinCoordinates(input.pinX, input.pinY);

  let parentId: string | undefined;
  // A reply always inherits its parent's file/version — never whatever a
  // caller separately submitted — so a reply can never appear to "switch"
  // to a different file/version than the conversation it's replying to.
  // See "Version-specific conversations" in REQUIREMENTS_ALIGNMENT.md.
  let workspaceFileId = input.workspaceFileId;
  let fileVersionId = input.fileVersionId;

  if (input.parentId) {
    const parent = await prisma.reviewComment.findFirst({
      where: { id: input.parentId, workspaceId: input.workspaceId },
      select: { id: true, parentId: true, workspaceFileId: true, fileVersionId: true },
    });
    if (!parent) throw new CommentValidationError("The comment being replied to could not be found.");
    if (parent.parentId !== null) {
      throw new CommentValidationError("Replies can only be one level deep.");
    }
    parentId = parent.id;
    workspaceFileId = parent.workspaceFileId ?? undefined;
    fileVersionId = parent.fileVersionId ?? undefined;
  }

  if (workspaceFileId) {
    const file = await prisma.workspaceFile.findFirst({
      where: { id: workspaceFileId, workspaceId: input.workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!file) throw new CommentValidationError("This file does not belong to this project.");
  }

  if (fileVersionId) {
    const version = await prisma.fileVersion.findFirst({
      where: {
        id: fileVersionId,
        ...(workspaceFileId ? { fileId: workspaceFileId } : { file: { workspaceId: input.workspaceId } }),
      },
      select: { id: true },
    });
    if (!version) throw new CommentValidationError("This file version does not belong to this project.");
  }

  // A reply is never itself a new pin — it inherits the parent's context
  // and discussion, not a separate marker on the image.
  const pinX = parentId ? undefined : input.pinX;
  const pinY = parentId ? undefined : input.pinY;
  const isPin = pinX !== undefined && pinY !== undefined;

  return prisma.$transaction(async (tx) => {
    // Deterministic, stable per-version ordinal — MAX(pinNumber)+1 for this
    // fileVersionId, computed inside the same transaction as the insert so
    // two concurrent pin placements on the same version can never collide.
    // Never recomputed later, never carried forward to a later version —
    // see IMAGE_ANNOTATION_ARCHITECTURE.md.
    let pinNumber: number | undefined;
    if (isPin && fileVersionId) {
      const result = await tx.reviewComment.aggregate({
        where: { fileVersionId, pinNumber: { not: null } },
        _max: { pinNumber: true },
      });
      pinNumber = (result._max.pinNumber ?? 0) + 1;
    }

    const comment = await tx.reviewComment.create({
      data: {
        workspaceId: input.workspaceId,
        workspaceFileId: workspaceFileId ?? null,
        fileVersionId: fileVersionId ?? null,
        parentId: parentId ?? null,
        authorType: input.authorType,
        creatorAuthorId: input.creatorAuthorId ?? null,
        reviewerName: input.reviewerName ?? null,
        reviewerEmail: input.reviewerEmail ?? null,
        body,
        pinX: pinX ?? null,
        pinY: pinY ?? null,
        pinNumber: pinNumber ?? null,
      },
      select: { id: true, createdAt: true },
    });

    await recordActivity(tx, {
      action: parentId ? ActivityAction.COMMENT_REPLIED : ActivityAction.COMMENT_ADDED,
      actorType: input.authorType,
      actorName: input.actorName,
      workspaceId: input.workspaceId,
      metadata: { reviewerName: input.reviewerName ?? input.actorName, commentPreview: body.slice(0, 80) },
    });
    if (pinNumber !== undefined) {
      await recordActivity(tx, {
        action: ActivityAction.IMAGE_PIN_ADDED,
        actorType: input.authorType,
        actorName: input.actorName,
        workspaceId: input.workspaceId,
        metadata: { pinNumber },
      });
    }

    return {
      id: comment.id,
      parentId: parentId ?? null,
      authorType: input.authorType,
      authorName: input.actorName,
      body,
      status: "OPEN",
      createdAt: comment.createdAt.toISOString(),
    };
  });
}

export interface ClientCommentInput {
  body: string;
  workspaceFileId?: string;
  fileVersionId?: string;
  parentId?: string;
  pinX?: number;
  pinY?: number;
  reviewerName?: string;
  reviewerEmail?: string;
}

/** Client (token-holder) comment/reply. `reviewerName`/`reviewerEmail` are unverified, client-entered identity — never treated as proof. */
export async function addClientReviewComment(context: ReviewContext, input: ClientCommentInput): Promise<CreatedComment> {
  if ((READ_ONLY_WORKSPACE_STATUSES as readonly string[]).includes(context.workspace.status)) {
    throw new ReviewPortalReadOnlyError();
  }

  const reviewerName = (input.reviewerName ?? "").trim().slice(0, MAX_NAME_LENGTH) || "Reviewer";
  return createComment({
    workspaceId: context.workspaceId,
    authorType: "CLIENT",
    actorName: reviewerName,
    reviewerName,
    reviewerEmail: input.reviewerEmail?.trim().slice(0, MAX_NAME_LENGTH) || undefined,
    body: input.body,
    workspaceFileId: input.workspaceFileId,
    fileVersionId: input.fileVersionId,
    parentId: input.parentId,
    pinX: input.pinX,
    pinY: input.pinY,
  });
}

export interface CreatorCommentInput {
  body: string;
  workspaceFileId?: string;
  fileVersionId?: string;
  parentId?: string;
}

/** Authenticated creator comment/reply — requires workspace ownership. */
export async function addCreatorReviewComment(workspaceId: string, input: CreatorCommentInput): Promise<CreatedComment> {
  const { creator } = await requireOwnedWorkspace(workspaceId);
  return createComment({
    workspaceId,
    authorType: "CREATOR",
    creatorAuthorId: creator.id,
    actorName: creator.name,
    body: input.body,
    workspaceFileId: input.workspaceFileId,
    fileVersionId: input.fileVersionId,
    parentId: input.parentId,
  });
}

/**
 * Creator resolves an OPEN comment on an owned workspace. Never deletes the
 * comment. `expectedWorkspaceId`, when given, additionally requires the
 * comment to belong to that exact workspace — so a Route Handler whose URL
 * names a workspace can't be used to resolve a comment from a *different*
 * workspace the same creator happens to also own. Both "doesn't exist" and
 * "exists but wrong workspace" collapse into the same CommentNotFoundError,
 * same as OwnershipError elsewhere — never reveal which case it was.
 */
export async function resolveReviewComment(commentId: string, expectedWorkspaceId?: string): Promise<void> {
  const creator = await requireAuthenticatedUser();

  const comment = await prisma.reviewComment.findFirst({
    where: { id: commentId, workspace: { creatorId: creator.id } },
  });
  if (!comment) throw new CommentNotFoundError();
  if (expectedWorkspaceId && comment.workspaceId !== expectedWorkspaceId) throw new CommentNotFoundError();
  if (comment.status === "RESOLVED") return; // idempotent

  await prisma.$transaction(async (tx) => {
    await tx.reviewComment.update({
      where: { id: commentId },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: creator.id },
    });
    await recordActivity(tx, {
      action: ActivityAction.COMMENT_RESOLVED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: comment.workspaceId,
    });
  });
}

export interface ReviewCommentThreadItem {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  status: string;
  createdAt: string;
  workspaceFileId: string | null;
  /** Phase 7.5 — which FileVersion this comment belongs to, so a client viewing v2 never sees v1's conversation and vice versa. null for a workspace-level general comment (no file selected). */
  fileVersionId: string | null;
  pinX: number | null;
  pinY: number | null;
  /** Stable per-version ordinal for a pin comment — null for a non-pin comment or a reply. */
  pinNumber: number | null;
  resolvedAt: string | null;
  replies: ReviewCommentThreadItem[];
}

function displayAuthorName(comment: { authorType: string; reviewerName: string | null; creatorAuthor: { name: string } | null }): string {
  if (comment.authorType === "CREATOR") return comment.creatorAuthor?.name ?? "Creator";
  return comment.reviewerName ?? "Reviewer";
}

/** Top-level comments (with one level of replies nested) for a workspace, deterministic chronological order. Used by both the creator Comments tab and the client review portal. */
export async function getReviewCommentThreads(workspaceId: string): Promise<ReviewCommentThreadItem[]> {
  const comments = await prisma.reviewComment.findMany({
    where: { workspaceId },
    include: { creatorAuthor: { select: { name: true } }, replies: { include: { creatorAuthor: { select: { name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return comments
    .filter((c) => c.parentId === null)
    .map((c) => ({
      id: c.id,
      authorType: c.authorType,
      authorName: displayAuthorName(c),
      body: c.body,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      workspaceFileId: c.workspaceFileId,
      fileVersionId: c.fileVersionId,
      pinX: c.pinX,
      pinY: c.pinY,
      pinNumber: c.pinNumber,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      replies: c.replies.map((r) => ({
        id: r.id,
        authorType: r.authorType,
        authorName: displayAuthorName(r),
        body: r.body,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        workspaceFileId: r.workspaceFileId,
        fileVersionId: r.fileVersionId,
        pinX: r.pinX,
        pinY: r.pinY,
        pinNumber: r.pinNumber,
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        replies: [],
      })),
    }));
}

/** Creator-owned variant — same shape, with the ownership check applied. */
export async function getOwnedReviewCommentThreads(workspaceId: string): Promise<ReviewCommentThreadItem[]> {
  await requireOwnedWorkspace(workspaceId);
  return getReviewCommentThreads(workspaceId);
}
