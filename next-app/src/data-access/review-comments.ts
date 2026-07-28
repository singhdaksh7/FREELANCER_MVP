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

/**
 * Shared comment-creation core for both creator and client (token-holder)
 * comments — every association a caller supplies (file, version, parent)
 * is re-verified against `workspaceId` here, so neither an authenticated
 * creator nor a review token can smuggle a cross-workspace id through.
 */
async function createComment(input: CreateCommentInput): Promise<{ id: string }> {
  const body = validateBody(input.body);
  validatePinCoordinates(input.pinX, input.pinY);

  if (input.workspaceFileId) {
    const file = await prisma.workspaceFile.findFirst({
      where: { id: input.workspaceFileId, workspaceId: input.workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!file) throw new CommentValidationError("This file does not belong to this project.");
  }

  if (input.fileVersionId) {
    const version = await prisma.fileVersion.findFirst({
      where: {
        id: input.fileVersionId,
        ...(input.workspaceFileId ? { fileId: input.workspaceFileId } : { file: { workspaceId: input.workspaceId } }),
      },
      select: { id: true },
    });
    if (!version) throw new CommentValidationError("This file version does not belong to this project.");
  }

  let parentId: string | undefined;
  if (input.parentId) {
    const parent = await prisma.reviewComment.findFirst({
      where: { id: input.parentId, workspaceId: input.workspaceId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new CommentValidationError("The comment being replied to could not be found.");
    if (parent.parentId !== null) {
      throw new CommentValidationError("Replies can only be one level deep.");
    }
    parentId = parent.id;
  }

  return prisma.$transaction(async (tx) => {
    const comment = await tx.reviewComment.create({
      data: {
        workspaceId: input.workspaceId,
        workspaceFileId: input.workspaceFileId ?? null,
        fileVersionId: input.fileVersionId ?? null,
        parentId: parentId ?? null,
        authorType: input.authorType,
        creatorAuthorId: input.creatorAuthorId ?? null,
        reviewerName: input.reviewerName ?? null,
        reviewerEmail: input.reviewerEmail ?? null,
        body,
        pinX: input.pinX ?? null,
        pinY: input.pinY ?? null,
      },
      select: { id: true },
    });

    await recordActivity(tx, {
      action: parentId ? ActivityAction.COMMENT_REPLIED : ActivityAction.COMMENT_ADDED,
      actorType: input.authorType,
      actorName: input.actorName,
      workspaceId: input.workspaceId,
      metadata: { reviewerName: input.reviewerName ?? input.actorName, commentPreview: body.slice(0, 80) },
    });

    return { id: comment.id };
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
export async function addClientReviewComment(context: ReviewContext, input: ClientCommentInput): Promise<{ id: string }> {
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
export async function addCreatorReviewComment(workspaceId: string, input: CreatorCommentInput): Promise<{ id: string }> {
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

/** Creator resolves an OPEN comment on an owned workspace. Never deletes the comment. */
export async function resolveReviewComment(commentId: string): Promise<void> {
  const creator = await requireAuthenticatedUser();

  const comment = await prisma.reviewComment.findFirst({
    where: { id: commentId, workspace: { creatorId: creator.id } },
  });
  if (!comment) throw new CommentNotFoundError();
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
  pinX: number | null;
  pinY: number | null;
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
      pinX: c.pinX,
      pinY: c.pinY,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      replies: c.replies.map((r) => ({
        id: r.id,
        authorType: r.authorType,
        authorName: displayAuthorName(r),
        body: r.body,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        workspaceFileId: r.workspaceFileId,
        pinX: r.pinX,
        pinY: r.pinY,
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
