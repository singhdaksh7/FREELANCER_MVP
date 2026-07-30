import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReviewContext } from "./review-auth";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { assertWorkspaceTransition } from "@/lib/workspace-transitions";
import { getPaymentGateway } from "@/payments";
import { decimalAmountToSubunits } from "@/payments/payment-amount";
import { calculatePaymentBreakdown } from "@/payments/platform-fee";
import { getPaymentConfig } from "@/payments/payment-config";
import { PaymentGatewayError } from "@/payments/payment-errors";
import { PaymentStatus, type Prisma } from "@/generated/prisma/client";

/**
 * Server-authorized payment-order creation for the client review portal —
 * see PAYMENT_ARCHITECTURE.md "Order lifecycle." Every value that ends up
 * in the local Payment row (amount, currency, workspace) is read from the
 * database, never accepted from the caller — the only caller-supplied
 * input is the already-authorized review token (see ReviewContext).
 */

export class WorkspaceNotApprovedError extends Error {
  constructor(message = "This project is not ready for payment yet.") {
    super(message);
    this.name = "WorkspaceNotApprovedError";
  }
}

/** Phase 7.5 — thrown for APPROVAL_ONLY/PREVIEW_ONLY workspaces, which never create a payment order at all. See DELIVERY_MODES.md. */
export class PaymentNotApplicableError extends Error {
  constructor(message = "This project does not require online payment.") {
    super(message);
    this.name = "PaymentNotApplicableError";
  }
}

export class NoApprovalFoundError extends Error {
  constructor(message = "No completed approval was found for this project.") {
    super(message);
    this.name = "NoApprovalFoundError";
  }
}

export class ApprovalSnapshotInvalidError extends Error {
  constructor(message = "The approved files for this project have changed. Please contact the creator.") {
    super(message);
    this.name = "ApprovalSnapshotInvalidError";
  }
}

export class PaymentOrderCreationFailedError extends Error {
  constructor(message = "We could not start a payment for this project. Please try again.") {
    super(message);
    this.name = "PaymentOrderCreationFailedError";
  }
}

export interface CheckoutConfig {
  paymentId: string;
  keyId: string;
  orderId: string;
  /** Serialized bigint — JSON has no native bigint type. */
  amountSubunits: string;
  amount: number;
  currency: string;
  workspaceTitle: string;
  creatorName: string;
  clientName: string;
}

type ApprovalSnapshotEntry = { workspaceFileId: string; fileVersionId: string; displayName: string; versionNumber: number };

async function assertSnapshotStillValid(snapshot: ApprovalSnapshotEntry[]): Promise<void> {
  if (snapshot.length === 0) return;
  const fileVersionIds = snapshot.map((entry) => entry.fileVersionId);
  const versions = await prisma.fileVersion.findMany({
    where: { id: { in: fileVersionIds } },
    select: { id: true, fileId: true, file: { select: { deletedAt: true } } },
  });
  const versionById = new Map(versions.map((v) => [v.id, v]));
  for (const entry of snapshot) {
    const version = versionById.get(entry.fileVersionId);
    if (!version || version.fileId !== entry.workspaceFileId || version.file.deletedAt !== null) {
      throw new ApprovalSnapshotInvalidError();
    }
  }
}

/** Deterministic per-attempt idempotency key — see PAYMENT_ARCHITECTURE.md "Idempotency." */
function buildIdempotencyKey(workspaceId: string, approvalId: string, attemptNumber: number): string {
  return `${workspaceId}:${approvalId}:attempt-${attemptNumber}`;
}

const ACTIVE_ORDER_STATUSES: PaymentStatus[] = [PaymentStatus.CREATED, PaymentStatus.PENDING];

/**
 * Creates (or safely reuses) a Payment + Razorpay order for the token's
 * workspace. Never trusts a workspace id, amount, or currency from the
 * caller — everything is re-derived from `context` (already
 * token-authorized) and the database.
 */
export async function createPaymentOrder(context: ReviewContext): Promise<CheckoutConfig> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: context.workspaceId },
    select: {
      id: true,
      status: true,
      deliveryMode: true,
      title: true,
      creator: { select: { name: true } },
      client: { select: { name: true } },
    },
  });

  if (workspace.deliveryMode !== "PAYMENT_REQUIRED") {
    throw new PaymentNotApplicableError();
  }
  if (workspace.status !== "APPROVED" && workspace.status !== "PAYMENT_PENDING") {
    throw new WorkspaceNotApprovedError();
  }

  const approval = await prisma.workspaceApproval.findFirst({
    where: { workspaceId: context.workspaceId, status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
  });
  if (!approval) throw new NoApprovalFoundError();
  // Security-gate fix: amount/currency come ONLY from the immutable,
  // frozen-at-approval-time WorkspaceApproval row — never from the
  // (editable-until-APPROVED) Workspace row itself. See
  // PAYMENT_ARCHITECTURE.md "Order lifecycle."
  if (approval.approvedAmount === null || approval.approvedCurrency === null) {
    throw new NoApprovalFoundError("This project's approved amount could not be determined. Please contact the creator.");
  }
  const approvedAmount = approval.approvedAmount;
  const approvedCurrency = approval.approvedCurrency;

  await assertSnapshotStillValid(approval.approvedFileVersionSnapshot as unknown as ApprovalSnapshotEntry[]);

  // Step 1: resolve-or-create the local Payment row transactionally, so
  // two concurrent requests can never both "win" and create two active
  // orders for the same workspace+approval (see "Duplicate order
  // prevention" below).
  const { payment, isNew } = await prisma.$transaction(async (tx) => {
    const existingActive = await tx.payment.findFirst({
      where: { workspaceId: context.workspaceId, approvalId: approval.id, status: { in: ACTIVE_ORDER_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    if (existingActive) return { payment: existingActive, isNew: false };

    const priorAttempts = await tx.payment.count({ where: { workspaceId: context.workspaceId, approvalId: approval.id } });
    const attemptNumber = priorAttempts + 1;
    const amountSubunits = decimalAmountToSubunits(approvedAmount.toString(), approvedCurrency);

    try {
      const created = await tx.payment.create({
        data: {
          workspaceId: context.workspaceId,
          approvalId: approval.id,
          reviewLinkId: context.reviewLinkId,
          amount: approvedAmount,
          amountSubunits,
          currency: approvedCurrency,
          status: "CREATED",
          gateway: "razorpay",
          attemptNumber,
          idempotencyKey: buildIdempotencyKey(context.workspaceId, approval.id, attemptNumber),
        },
      });
      return { payment: created, isNew: true };
    } catch (error) {
      // Unique-constraint race: another concurrent request already
      // created this exact attempt — reuse it instead of erroring.
      if ((error as { code?: string }).code === "P2002") {
        const raced = await tx.payment.findUniqueOrThrow({
          where: { idempotencyKey: buildIdempotencyKey(context.workspaceId, approval.id, attemptNumber) },
        });
        return { payment: raced, isNew: false };
      }
      throw error;
    }
  });

  if (payment.gatewayOrderId) {
    return buildCheckoutConfig(payment, workspace);
  }
  if (!isNew) {
    // An existing row with no gatewayOrderId means a previous attempt's
    // gateway call failed before it could be recorded — treat as
    // unrecoverable and let the caller retry (a fresh attempt number).
    throw new PaymentOrderCreationFailedError();
  }

  // Step 2: create the gateway order outside the DB transaction (an
  // external HTTP call has no place inside a Prisma transaction).
  let gatewayOrderId: string;
  try {
    const order = await getPaymentGateway().createOrder({
      amountSubunits: payment.amountSubunits,
      currency: payment.currency,
      receipt: payment.id,
      notes: { workspaceId: context.workspaceId },
    });
    gatewayOrderId = order.id;
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: "Order creation failed." },
    });
    if (error instanceof PaymentGatewayError) throw new PaymentOrderCreationFailedError();
    console.error("Payment order creation failed:", error);
    throw new PaymentOrderCreationFailedError();
  }

  // Step 3: persist the gateway order id, freeze the fee breakdown,
  // transition the workspace, and log activity together — all in the same
  // transaction as order creation, per PLATFORM_FEE_AND_PAYOUT_LEDGER.md
  // ("Freeze the breakdown at payment-order creation").
  const breakdown = calculatePaymentBreakdown({ projectAmountSubunits: payment.amountSubunits, currency: payment.currency });

  const finalized = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { gatewayOrderId } });

    await tx.paymentBreakdown.upsert({
      where: { paymentId: payment.id },
      create: {
        paymentId: payment.id,
        projectAmountSubunits: breakdown.projectAmountSubunits,
        clientChargedSubunits: breakdown.clientChargedSubunits,
        platformFeeBps: breakdown.platformFeeBps,
        platformFeeSubunits: breakdown.platformFeeSubunits,
        freelancerPayableSubunits: breakdown.freelancerPayableSubunits,
        currency: breakdown.currency,
      },
      // A retried order-creation attempt for the same Payment row (e.g. a
      // gateway timeout after the order was actually created) must never
      // produce two breakdown rows or silently drift from what was frozen
      // the first time — updating with the identical inputs is a no-op.
      update: {},
    });

    if (workspace.status === "APPROVED") {
      assertWorkspaceTransition("APPROVED", "PAYMENT_PENDING", workspace.deliveryMode);
      await tx.workspace.update({ where: { id: context.workspaceId }, data: { status: "PAYMENT_PENDING" } });
    }

    await recordActivity(tx, {
      action: ActivityAction.PAYMENT_ORDER_CREATED,
      actorType: "CLIENT",
      actorName: workspace.client.name,
      workspaceId: context.workspaceId,
      metadata: { amount: Number(approvedAmount), currency: approvedCurrency, gatewayOrderId },
    });
    await recordActivity(tx, {
      action: ActivityAction.PAYMENT_BREAKDOWN_CREATED,
      actorType: "SYSTEM",
      actorName: "System",
      workspaceId: context.workspaceId,
      metadata: {
        amount: Number(approvedAmount),
        platformFeeAmount: Number(breakdown.platformFeeSubunits) / 100,
        freelancerPayableAmount: Number(breakdown.freelancerPayableSubunits) / 100,
        currency: approvedCurrency,
      },
    });

    return updated;
  });

  return buildCheckoutConfig(finalized, workspace);
}

function buildCheckoutConfig(
  payment: Prisma.PaymentGetPayload<Record<string, never>>,
  workspace: { title: string; creator: { name: string }; client: { name: string } },
): CheckoutConfig {
  if (!payment.gatewayOrderId) throw new PaymentOrderCreationFailedError();
  return {
    paymentId: payment.id,
    keyId: getPaymentConfig().publicKeyId,
    orderId: payment.gatewayOrderId,
    amountSubunits: payment.amountSubunits.toString(),
    amount: Number(payment.amount),
    currency: payment.currency,
    workspaceTitle: workspace.title,
    creatorName: workspace.creator.name,
    clientName: workspace.client.name,
  };
}

/**
 * Safe, token-authorized payment-status lookup for the client's polling UI
 * — never exposes gateway secrets/signatures/storage keys, and (Phase 7.5
 * security-gate fix) never a raw download token either: once
 * FILES_UNLOCKED/DELIVERED, the client claims a download session
 * on-demand via `POST /api/review/[token]/downloads/claim` (see
 * src/data-access/downloads.ts's `claimDownloadSession`) — nothing here
 * hands back a bookmarkable URL directly.
 */
export interface ClientPaymentStatus {
  paymentId: string | null;
  status: string | null;
  workspaceStatus: string;
  /** True once a DownloadGrant exists for this workspace — tells the UI it's safe to show a "Download Files" action that calls the claim endpoint. */
  downloadReady: boolean;
  /** True when delivery-bundle preparation has permanently failed (worker exhausted its attempt) — lets the client UI show a distinct state instead of an indefinite "preparing" spinner. Payment truth is preserved either way. */
  deliveryFailed: boolean;
}

export async function getClientPaymentStatus(context: ReviewContext): Promise<ClientPaymentStatus> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: context.workspaceId },
    select: { status: true },
  });
  const payment = await prisma.payment.findFirst({
    where: { workspaceId: context.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  let downloadReady = false;
  let deliveryFailed = false;
  if (payment && (workspace.status === "FILES_UNLOCKED" || workspace.status === "DELIVERED")) {
    const grant = await prisma.downloadGrant.findUnique({ where: { paymentId: payment.id }, select: { id: true } });
    downloadReady = grant !== null;
  } else if (payment && workspace.status === "PAID") {
    const bundle = await prisma.deliveryBundle.findUnique({ where: { paymentId: payment.id }, select: { status: true } });
    deliveryFailed = bundle?.status === "FAILED";
  }

  return {
    paymentId: payment?.id ?? null,
    status: payment?.status ?? null,
    workspaceStatus: workspace.status,
    downloadReady,
    deliveryFailed,
  };
}
