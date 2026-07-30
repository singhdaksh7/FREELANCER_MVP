import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { wakeWorker } from "@/lib/worker-wake";

export class WorkspaceNotReleasableError extends Error {
  constructor(message = "This project is not currently awaiting a creator release.") {
    super(message);
    this.name = "WorkspaceNotReleasableError";
  }
}

export class NoApprovalFoundError extends Error {
  constructor(message = "No approval snapshot was found for this project.") {
    super(message);
    this.name = "NoApprovalFoundError";
  }
}

/**
 * The creator's explicit "Release Approved Files" action for APPROVAL_ONLY
 * workspaces — see DELIVERY_MODES.md. Creates exactly one DeliveryBundle +
 * DeliveryBundleJob from the immutable approval snapshot (no Payment, no
 * Razorpay order — paymentId is null), reusing the same secure-delivery
 * worker (src/worker/delivery-job-processor.ts) that PAYMENT_REQUIRED's
 * payment-captured path uses. The workspace stays AWAITING_CREATOR_RELEASE
 * until the worker actually moves it to FILES_UNLOCKED, exactly like PAID
 * stays PAID until the same worker unlocks it for the payment-required
 * flow.
 */
export async function releaseApprovedFiles(workspaceId: string): Promise<void> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);

  if (workspace.deliveryMode !== "APPROVAL_ONLY" || workspace.status !== "AWAITING_CREATOR_RELEASE") {
    throw new WorkspaceNotReleasableError();
  }

  const approval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId, status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: { id: true },
  });
  if (!approval) throw new NoApprovalFoundError();

  const existingBundle = await prisma.deliveryBundle.findFirst({ where: { approvalId: approval.id }, select: { id: true } });
  if (existingBundle) return; // already released (or releasing) — idempotent no-op, never a second bundle

  await prisma.$transaction(async (tx) => {
    const bundle = await tx.deliveryBundle.create({
      data: { workspaceId, paymentId: null, approvalId: approval.id, status: "PENDING" },
    });
    await tx.deliveryBundleJob.create({ data: { deliveryBundleId: bundle.id, status: "PENDING" } });

    await recordActivity(tx, {
      action: ActivityAction.FILES_RELEASED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
    });
    await recordActivity(tx, {
      action: ActivityAction.DELIVERY_PREPARATION_STARTED,
      actorType: "SYSTEM",
      actorName: "System",
      workspaceId,
    });
  });

  wakeWorker("delivery");
}
