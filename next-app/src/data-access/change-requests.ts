import "server-only";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";
import type { ReviewContext } from "./review-auth";

export class ChangeRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeRequestValidationError";
  }
}

export class ChangeRequestAlreadyOpenError extends Error {
  constructor(message = "A change request is already open for this project.") {
    super(message);
    this.name = "ChangeRequestAlreadyOpenError";
  }
}

const MAX_SUMMARY_LENGTH = 4000;

export interface RequestChangesInput {
  summary: string;
  reviewerName?: string;
  reviewerEmail?: string;
  /** Open comments the client chose to reference — quoted into the stored summary rather than modeled as a separate join table. */
  referencedCommentBodies?: string[];
}

/**
 * Creates a ChangeRequest and moves the workspace to CHANGES_REQUESTED.
 * Refuses (without creating a duplicate) if a request is already OPEN, or
 * if the workspace isn't currently IN_REVIEW.
 */
export async function createChangeRequest(context: ReviewContext, input: RequestChangesInput): Promise<{ id: string }> {
  const summary = input.summary.trim();
  if (summary.length === 0) {
    throw new ChangeRequestValidationError("Please describe the changes you'd like.");
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    throw new ChangeRequestValidationError(`Summary must be ${MAX_SUMMARY_LENGTH} characters or fewer.`);
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: context.workspaceId }, select: { status: true } });

  const existingOpen = await prisma.changeRequest.findFirst({
    where: { workspaceId: context.workspaceId, status: "OPEN" },
  });
  if (existingOpen) {
    throw new ChangeRequestAlreadyOpenError();
  }

  assertWorkspaceTransition(workspace.status, "CHANGES_REQUESTED");

  const fullSummary =
    input.referencedCommentBodies && input.referencedCommentBodies.length > 0
      ? `${summary}\n\nReferenced comments:\n${input.referencedCommentBodies.map((b) => `- ${b}`).join("\n")}`
      : summary;

  const reviewerName = (input.reviewerName ?? "").trim() || "Reviewer";

  return prisma.$transaction(async (tx) => {
    const changeRequest = await tx.changeRequest.create({
      data: {
        workspaceId: context.workspaceId,
        reviewLinkId: context.reviewLinkId,
        reviewerName,
        reviewerEmail: input.reviewerEmail?.trim() || null,
        summary: fullSummary,
        status: "OPEN",
      },
      select: { id: true },
    });
    await tx.workspace.update({ where: { id: context.workspaceId }, data: { status: "CHANGES_REQUESTED" } });
    await recordActivity(tx, {
      action: ActivityAction.CHANGES_REQUESTED,
      actorType: "CLIENT",
      actorName: reviewerName,
      workspaceId: context.workspaceId,
      metadata: { reviewerName, changeRequestSummary: summary.slice(0, 200) },
    });
    return { id: changeRequest.id };
  });
}

export interface ActiveChangeRequest {
  id: string;
  summary: string;
  reviewerName: string | null;
  requestedAt: string;
}

/** The currently OPEN change request for a workspace, if any — shown on the creator workspace and used to block approval. */
export async function getActiveChangeRequest(workspaceId: string): Promise<ActiveChangeRequest | null> {
  const changeRequest = await prisma.changeRequest.findFirst({
    where: { workspaceId, status: "OPEN" },
    orderBy: { requestedAt: "desc" },
  });
  if (!changeRequest) return null;
  return {
    id: changeRequest.id,
    summary: changeRequest.summary,
    reviewerName: changeRequest.reviewerName,
    requestedAt: changeRequest.requestedAt.toISOString(),
  };
}
