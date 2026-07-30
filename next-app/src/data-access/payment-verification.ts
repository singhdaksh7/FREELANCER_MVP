import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReviewContext } from "./review-auth";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { getPaymentGateway } from "@/payments";
import { InvalidSignatureError, UnknownOrderError } from "@/payments/payment-errors";

/**
 * Checkout-callback signature verification — see PAYMENT_ARCHITECTURE.md
 * "Checkout callback." Verifying the signature here does NOT mark the
 * payment PAID — capture must still be independently confirmed via
 * webhook or reconciliation (src/data-access/payment-finalization.ts).
 * This function's only job is: is this really the payment/order pair
 * Razorpay Checkout says it is, for a Payment this app itself created.
 */

export interface CheckoutVerificationResult {
  paymentId: string;
  verified: true;
}

/**
 * Verifies a Checkout callback's signature using the server-stored order
 * id (never the browser-submitted one, though the two are checked to
 * match structurally by the lookup itself), scoped to the token's own
 * workspace so a client can never verify a signature against another
 * workspace's payment.
 */
export async function verifyCheckoutCallback(
  context: ReviewContext,
  input: { orderId: string; paymentId: string; signature: string },
): Promise<CheckoutVerificationResult> {
  const payment = await prisma.payment.findFirst({
    where: { workspaceId: context.workspaceId, gatewayOrderId: input.orderId },
  });

  if (!payment || !payment.gatewayOrderId) {
    throw new UnknownOrderError();
  }

  const gateway = getPaymentGateway();
  const isValid = gateway.verifyCheckoutSignature({
    // Always the server-stored order id — never the caller-submitted one,
    // even though in practice they're the same string here (the lookup
    // above already required an exact match to find this row at all).
    orderId: payment.gatewayOrderId,
    paymentId: input.paymentId,
    signature: input.signature,
  });

  if (!isValid) {
    await prisma.$transaction(async (tx) => {
      await recordActivity(tx, {
        action: ActivityAction.PAYMENT_CHECKOUT_VERIFICATION_FAILED,
        actorType: "SYSTEM",
        actorName: "System",
        workspaceId: context.workspaceId,
      });
    });
    throw new InvalidSignatureError();
  }

  if (payment.gatewayPaymentId && payment.gatewayPaymentId !== input.paymentId) {
    // A different payment id than one already recorded for this order —
    // never overwrite; treat as an unverifiable mismatch.
    throw new InvalidSignatureError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId: input.paymentId,
        gatewaySignatureVerifiedAt: new Date(),
        status: payment.status === "CREATED" ? "PENDING" : payment.status,
      },
    });
    await recordActivity(tx, {
      action: ActivityAction.PAYMENT_CHECKOUT_VERIFIED,
      actorType: "SYSTEM",
      actorName: "System",
      workspaceId: context.workspaceId,
    });
  });

  return { paymentId: payment.id, verified: true };
}
