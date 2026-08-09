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
 * The ONE idempotent auto-delivery trigger — see the "NEW PRODUCT RULE"
 * removing the manual freelancer-release step. Every path that can make a
 * workspace eligible for delivery converges here:
 *
 * - PAYMENT_REQUIRED: finalizeCapturedPayment (src/data-access/payment-finalization.ts),
 *   called from the webhook route, reconcilePaymentStatus, AND this
 *   module's legacy releaseApprovedFiles fallback.
 * - APPROVAL_ONLY: approveWorkspace (src/data-access/approvals.ts).
 * - Recovery: getClientPaymentStatus (src/data-access/payment-orders.ts)
 *   opportunistically re-calls this on every client status poll, so a
 *   transient failure right after payment/approval self-heals without any
 *   creator or admin action.
 *
 * Eligibility (re-checked every call, never trusted from the caller):
 *   - an APPROVED WorkspaceApproval snapshot exists
 *   - no OPEN ChangeRequest
 *   - PAYMENT_REQUIRED additionally requires a PAID Payment tied to that
 *     exact approval
 * A workspace that doesn't (yet) meet its mode's condition is left alone —
 * this is a safe no-op, never an error, so callers can call it speculatively.
 *
 * Idempotency is enforced at the database level: DeliveryBundle.approvalId
 * is @unique (see prisma/migrations/20260810120000_delivery_bundle_approval_unique),
 * so a concurrent duplicate call always loses the insert race with P2002
 * and is treated as "already enqueued," never a second bundle.
 */
export async function ensureApprovedDeliveryEnqueued(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, creatorId: true, deliveryMode: true },
  });
  if (!workspace) return;

  const approval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId, status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: { id: true },
  });
  if (!approval) return;

  const openChangeRequest = await prisma.changeRequest.findFirst({
    where: { workspaceId, status: "OPEN" },
    select: { id: true },
  });
  if (openChangeRequest) return;

  const payment =
    workspace.deliveryMode === "PAYMENT_REQUIRED"
      ? await prisma.payment.findFirst({ where: { workspaceId, approvalId: approval.id, status: "PAID" }, select: { id: true } })
      : null;
  if (workspace.deliveryMode === "PAYMENT_REQUIRED" && !payment) return;

  const existingBundle = await prisma.deliveryBundle.findUnique({ where: { approvalId: approval.id }, select: { id: true } });
  if (existingBundle) return; // already enqueued (or completed) — idempotent no-op, never a second bundle

  try {
    await prisma.$transaction(async (tx) => {
      const bundle = await tx.deliveryBundle.create({
        data: { workspaceId, paymentId: payment?.id ?? null, approvalId: approval.id, status: "PENDING" },
      });
      await tx.deliveryBundleJob.create({ data: { deliveryBundleId: bundle.id, status: "PENDING" } });

      await recordActivity(tx, {
        action: ActivityAction.DELIVERY_PREPARATION_STARTED,
        actorType: "SYSTEM",
        actorName: "System",
        workspaceId,
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      // Lost a genuine concurrent-enqueue race (webhook vs. reconciliation,
      // or two recovery polls) — the winner already created the bundle.
      return;
    }
    throw error;
  }

  wakeWorker("delivery");
}

/**
 * LEGACY / internal only — no longer reachable from any creator-facing UI.
 * Retained for backward compatibility with any workspace that was already
 * sitting in AWAITING_CREATOR_RELEASE before auto-delivery shipped, and as
 * a manually-triggerable fallback (e.g. support tooling) if
 * ensureApprovedDeliveryEnqueued's automatic triggers were ever missed.
 * Delegates to the same idempotent core above — it can never create a
 * second bundle for an approval auto-delivery already handled.
 */
export async function releaseApprovedFiles(workspaceId: string): Promise<void> {
  const { workspace } = await requireOwnedWorkspace(workspaceId);

  if (workspace.status !== "AWAITING_CREATOR_RELEASE") {
    throw new WorkspaceNotReleasableError();
  }

  const approval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId, status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    select: { id: true },
  });
  if (!approval) throw new NoApprovalFoundError();

  if (workspace.deliveryMode === "PAYMENT_REQUIRED") {
    const payment = await prisma.payment.findFirst({ where: { workspaceId, approvalId: approval.id, status: "PAID" }, select: { id: true } });
    if (!payment) throw new WorkspaceNotReleasableError();
  }

  await ensureApprovedDeliveryEnqueued(workspaceId);
}
