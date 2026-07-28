import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";

export class RevisionNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionNotReadyError";
  }
}

/**
 * Explicit "Submit Revision for Review" action — uploading a new file
 * version alone never moves the workflow or makes anything client-visible
 * (see FileVersion.submittedAt in schema.prisma). Requires CHANGES_REQUESTED,
 * at least one version newer than the active change request, and no
 * pending (still-processing or failed) candidate version anywhere in the
 * workspace.
 */
export async function submitRevision(workspaceId: string): Promise<void> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);

  if (workspace.status !== "CHANGES_REQUESTED") {
    throw new RevisionNotReadyError("Revisions can only be submitted while changes are requested.");
  }

  const activeChangeRequest = await prisma.changeRequest.findFirst({
    where: { workspaceId, status: "OPEN" },
    orderBy: { requestedAt: "desc" },
  });
  if (!activeChangeRequest) {
    throw new RevisionNotReadyError("There is no open change request to resolve.");
  }

  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId, deletedAt: null },
    include: { currentVersion: true },
  });

  if (files.some((f) => f.pendingVersionId !== null)) {
    throw new RevisionNotReadyError("Wait for all uploaded versions to finish processing (or fix failed ones) before submitting.");
  }
  if (files.some((f) => f.currentVersion && f.currentVersion.status !== "READY")) {
    throw new RevisionNotReadyError("All files must be in a ready state before submitting a revision.");
  }

  const hasNewVersion = files.some(
    (f) => f.currentVersion && f.currentVersion.createdAt > activeChangeRequest.requestedAt,
  );
  if (!hasNewVersion) {
    throw new RevisionNotReadyError("Upload at least one new file version before submitting a revision.");
  }

  const versionIdsToSubmit = files
    .filter((f) => f.currentVersion && f.currentVersion.submittedAt === null)
    .map((f) => f.currentVersion!.id);

  assertWorkspaceTransition(workspace.status, "IN_REVIEW");

  await prisma.$transaction(async (tx) => {
    if (versionIdsToSubmit.length > 0) {
      await tx.fileVersion.updateMany({
        where: { id: { in: versionIdsToSubmit } },
        data: { submittedAt: new Date() },
      });
    }
    await tx.changeRequest.update({
      where: { id: activeChangeRequest.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: creator.id },
    });
    await tx.workspace.update({ where: { id: workspaceId }, data: { status: "IN_REVIEW" } });
    await recordActivity(tx, {
      action: ActivityAction.REVISION_SUBMITTED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
      metadata: { versionCount: files.length },
    });
  });
}
