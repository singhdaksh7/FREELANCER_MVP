import "server-only";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";
import type { ReviewContext } from "./review-auth";
import type { Prisma } from "@/generated/prisma/client";

export class ApprovalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalValidationError";
  }
}

export class ApprovalBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalBlockedError";
  }
}

export class ApprovalAlreadyCompletedError extends Error {
  constructor(message = "This project has already been approved.") {
    super(message);
    this.name = "ApprovalAlreadyCompletedError";
  }
}

export interface ApproveWorkspaceInput {
  reviewerName: string;
  reviewerEmail?: string;
  termsAccepted: boolean;
  userAgent?: string;
}

/**
 * Client approval — explicitly never sets PAID/FILES_UNLOCKED and never
 * grants original download access (Phase 7 scope). Builds an immutable
 * snapshot of exactly which file/version ids were approved, so a later
 * file change can never retroactively alter what was actually approved.
 */
export async function approveWorkspace(context: ReviewContext, input: ApproveWorkspaceInput): Promise<{ id: string }> {
  const reviewerName = input.reviewerName.trim();
  if (reviewerName.length === 0) {
    throw new ApprovalValidationError("Please enter your name to approve this project.");
  }
  if (!input.termsAccepted) {
    throw new ApprovalValidationError("Please accept the terms to continue.");
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: context.workspaceId },
    select: { status: true },
  });

  const existingApproval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId: context.workspaceId, status: "APPROVED" },
  });
  if (existingApproval) {
    throw new ApprovalAlreadyCompletedError();
  }

  if (workspace.status !== "IN_REVIEW") {
    throw new ApprovalBlockedError("This project is not currently open for approval.");
  }

  const openChangeRequest = await prisma.changeRequest.findFirst({
    where: { workspaceId: context.workspaceId, status: "OPEN" },
  });
  if (openChangeRequest) {
    throw new ApprovalBlockedError("This project has an open change request and cannot be approved yet.");
  }

  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId: context.workspaceId, deletedAt: null },
    include: { currentVersion: true },
  });
  const submittedFiles = files.filter((f) => f.currentVersion?.submittedAt);

  if (submittedFiles.length === 0) {
    throw new ApprovalBlockedError("There is nothing submitted for review yet.");
  }
  if (submittedFiles.some((f) => f.currentVersion!.status !== "READY")) {
    throw new ApprovalBlockedError("All submitted files must be ready before this project can be approved.");
  }

  assertWorkspaceTransition(workspace.status, "APPROVED");

  const snapshot = submittedFiles.map((f) => ({
    workspaceFileId: f.id,
    displayName: f.displayName,
    fileVersionId: f.currentVersion!.id,
    versionNumber: f.currentVersion!.versionNumber,
  }));

  const approval = await prisma.$transaction(async (tx) => {
    const created = await tx.workspaceApproval.create({
      data: {
        workspaceId: context.workspaceId,
        reviewLinkId: context.reviewLinkId,
        approvedFileVersionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        reviewerName,
        reviewerEmail: input.reviewerEmail?.trim() || null,
        status: "APPROVED",
        termsAccepted: true,
        userAgent: input.userAgent?.slice(0, 500) || null,
      },
      select: { id: true },
    });
    await tx.workspace.update({ where: { id: context.workspaceId }, data: { status: "APPROVED", approvedAt: new Date() } });
    await recordActivity(tx, {
      action: ActivityAction.PROJECT_APPROVED,
      actorType: "CLIENT",
      actorName: reviewerName,
      workspaceId: context.workspaceId,
      metadata: { reviewerName },
    });
    return created;
  });

  return { id: approval.id };
}

export interface ApprovalSummary {
  reviewerName: string;
  approvedAt: string;
  snapshot: Array<{ workspaceFileId: string; displayName: string; fileVersionId: string; versionNumber: number }>;
}

/** Read-only lookup for the client portal's "already approved" confirmation screen. */
export async function getApprovalSummary(workspaceId: string): Promise<ApprovalSummary | null> {
  const approval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId, status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
  });
  if (!approval) return null;
  return {
    reviewerName: approval.reviewerName,
    approvedAt: approval.approvedAt.toISOString(),
    snapshot: approval.approvedFileVersionSnapshot as ApprovalSummary["snapshot"],
  };
}
