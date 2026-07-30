import "server-only";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";
import { AmountMismatchError, CurrencyMismatchError, UnknownOrderError } from "@/payments/payment-errors";
import { getPayoutConfig } from "@/payouts/payout-config";
import { wakeWorker } from "@/lib/worker-wake";

/**
 * The ONE idempotent payment-finalization service — see
 * PAYMENT_ARCHITECTURE.md "Payment state machine." Both the webhook route
 * (`/api/webhooks/razorpay`) and the reconciliation path
 * (`reconcilePaymentStatus`, src/data-access/payment-reconciliation.ts)
 * call this and only this to move a Payment/Workspace to PAID — neither
 * implements any separate state-changing logic of its own.
 */

export class WorkspaceNotPayableError extends Error {
  constructor(message = "This project is not currently awaiting payment.") {
    super(message);
    this.name = "WorkspaceNotPayableError";
  }
}

export interface FinalizeCapturedPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountSubunits: bigint;
  currency: string;
}

export interface FinalizeCapturedPaymentResult {
  paymentId: string;
  workspaceId: string;
  alreadyFinalized: boolean;
}

const PAYABLE_WORKSPACE_STATUSES = ["PAYMENT_PENDING"] as const;
const POST_PAYMENT_STATUSES = ["PAID", "FILES_UNLOCKED", "DELIVERED"] as const;

/**
 * Marks a captured, signature/webhook-verified payment PAID, moves its
 * workspace to PAID, and kicks off delivery preparation (one
 * DeliveryBundle + one DeliveryBundleJob) — all in a single transaction.
 * Safe to call repeatedly with the same gatewayOrderId/gatewayPaymentId
 * (webhook retries, or a webhook arriving after reconciliation already
 * finalized the same payment): returns `alreadyFinalized: true` without
 * making any further change.
 */
export async function finalizeCapturedPayment(input: FinalizeCapturedPaymentInput): Promise<FinalizeCapturedPaymentResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { gatewayOrderId: input.gatewayOrderId },
        include: {
          workspace: { select: { id: true, status: true, deliveryMode: true, creatorId: true } },
          breakdown: true,
        },
      });
      if (!payment) throw new UnknownOrderError();

      if (payment.status === "PAID") {
        return { paymentId: payment.id, workspaceId: payment.workspaceId, alreadyFinalized: true };
      }

      if (payment.currency !== input.currency) throw new CurrencyMismatchError();
      if (payment.amountSubunits !== input.amountSubunits) throw new AmountMismatchError();
      if (payment.gatewayPaymentId && payment.gatewayPaymentId !== input.gatewayPaymentId) {
        throw new UnknownOrderError("Gateway payment id mismatch for this order.");
      }

      const workspace = payment.workspace;
      const workspaceAlreadyPaid = (POST_PAYMENT_STATUSES as readonly string[]).includes(workspace.status);
      if (!workspaceAlreadyPaid && !(PAYABLE_WORKSPACE_STATUSES as readonly string[]).includes(workspace.status)) {
        throw new WorkspaceNotPayableError();
      }

      const capturedAt = new Date();
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", gatewayPaymentId: input.gatewayPaymentId, capturedAt, paidAt: capturedAt },
      });

      if (workspace.status === "PAYMENT_PENDING") {
        assertWorkspaceTransition("PAYMENT_PENDING", "PAID", workspace.deliveryMode);
        await tx.workspace.update({ where: { id: workspace.id }, data: { status: "PAID", paidAt: capturedAt } });
      }

      await recordActivity(tx, {
        action: ActivityAction.PAYMENT_CAPTURED,
        actorType: "SYSTEM",
        actorName: "Razorpay",
        workspaceId: workspace.id,
        metadata: { amount: Number(updatedPayment.amount), currency: updatedPayment.currency, gatewayPaymentId: input.gatewayPaymentId },
      });

      // Exactly one DeliveryBundle + one DeliveryBundleJob per payment —
      // DeliveryBundle.paymentId is @unique, so a genuine race with a
      // second finalization attempt fails this insert with P2002 (caught
      // below) rather than ever producing two bundles.
      const bundle = await tx.deliveryBundle.create({
        data: { workspaceId: workspace.id, paymentId: payment.id, approvalId: payment.approvalId, status: "PENDING" },
      });
      await tx.deliveryBundleJob.create({ data: { deliveryBundleId: bundle.id, status: "PENDING" } });

      await recordActivity(tx, {
        action: ActivityAction.DELIVERY_PREPARATION_STARTED,
        actorType: "SYSTEM",
        actorName: "System",
        workspaceId: workspace.id,
      });

      // Freelancer payable ledger credit — see
      // PLATFORM_FEE_AND_PAYOUT_LEDGER.md. Uses the breakdown frozen at
      // order-creation time (never recomputed here), and is itself
      // idempotent per Payment (payoutLedgerEntry rows aren't uniquely
      // constrained on paymentId, so this checks for an existing
      // PAYMENT_CREDIT entry first — the surrounding P2002 catch on
      // deliveryBundle.create already makes a genuine concurrent-retry
      // land in the `alreadyFinalized` branch before reaching this code
      // a second time, but this guard also covers the first-attempt path
      // if finalizeCapturedPayment is ever called again after a partial
      // failure downstream of this point).
      if (payment.breakdown) {
        const existingCredit = await tx.payoutLedgerEntry.findFirst({
          where: { paymentId: payment.id, type: "PAYMENT_CREDIT" },
          select: { id: true },
        });
        if (!existingCredit) {
          const { holdHours } = getPayoutConfig();
          const availableAt = new Date(capturedAt.getTime() + holdHours * 60 * 60 * 1000);

          await tx.payoutLedgerEntry.create({
            data: {
              creatorId: workspace.creatorId,
              paymentId: payment.id,
              type: "PAYMENT_CREDIT",
              amountSubunits: payment.breakdown.freelancerPayableSubunits,
              currency: payment.breakdown.currency,
              status: "PENDING",
              availableAt,
            },
          });
          await tx.payoutLedgerEntry.create({
            data: {
              creatorId: workspace.creatorId,
              paymentId: payment.id,
              type: "PLATFORM_FEE",
              amountSubunits: payment.breakdown.platformFeeSubunits,
              currency: payment.breakdown.currency,
              status: "PAID",
            },
          });

          await tx.creatorBalanceAccount.upsert({
            where: { creatorId: workspace.creatorId },
            create: {
              creatorId: workspace.creatorId,
              currency: payment.breakdown.currency,
              pendingSubunits: payment.breakdown.freelancerPayableSubunits,
            },
            update: { pendingSubunits: { increment: payment.breakdown.freelancerPayableSubunits } },
          });

          await recordActivity(tx, {
            action: ActivityAction.FREELANCER_PAYABLE_CREATED,
            actorType: "SYSTEM",
            actorName: "System",
            creatorId: workspace.creatorId,
            workspaceId: workspace.id,
            metadata: {
              freelancerPayableAmount: Number(payment.breakdown.freelancerPayableSubunits) / 100,
              currency: payment.breakdown.currency,
            },
          });
        }
      }

      return { paymentId: updatedPayment.id, workspaceId: workspace.id, alreadyFinalized: false };
    });

    if (!result.alreadyFinalized) wakeWorker("delivery");
    return result;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      // Lost a genuine concurrent-finalization race — the winner already
      // committed everything; report success idempotently.
      const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: input.gatewayOrderId } });
      if (payment) return { paymentId: payment.id, workspaceId: payment.workspaceId, alreadyFinalized: true };
    }
    throw error;
  }
}

/** Records a safe, non-state-changing PAYMENT_FAILED activity entry — never touches Payment/Workspace status beyond marking this specific Payment row FAILED. */
export async function recordPaymentFailure(gatewayOrderId: string, failureCode: string | null, failureReason: string | null): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { gatewayOrderId } });
  if (!payment || payment.status === "PAID") return; // never downgrade an already-captured payment

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failedAt: new Date(), failureCode, failureReason },
    });
    await recordActivity(tx, {
      action: ActivityAction.PAYMENT_FAILED,
      actorType: "SYSTEM",
      actorName: "Razorpay",
      workspaceId: payment.workspaceId,
      metadata: { failureCode: failureCode ?? undefined },
    });
  });
}
