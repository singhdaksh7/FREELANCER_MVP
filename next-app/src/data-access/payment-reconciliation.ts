import "server-only";
import { prisma } from "@/lib/prisma";
import { getPaymentGateway } from "@/payments";
import { getReconciliationConfig } from "@/payments/payment-config";
import { finalizeCapturedPayment, recordPaymentFailure } from "./payment-finalization";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Server-side reconciliation fallback — see PAYMENT_ARCHITECTURE.md
 * "Reconciliation." Fetches the payment's live status from the gateway
 * (never trusts a browser-supplied amount/status) and, on a captured
 * result, routes through the exact same `finalizeCapturedPayment` service
 * the webhook uses — no separate state-changing logic here.
 */

export interface ReconciliationResult {
  status: string;
}

/**
 * `paymentId` is a local Payment id — resolved by the caller (either the
 * token-authorized client polling endpoint, or a creator's authenticated
 * "refresh status" action), never accepted as a bare, unauthorized input
 * by this function itself.
 */
export async function reconcilePaymentStatus(paymentId: string): Promise<ReconciliationResult> {
  const { cooldownSeconds } = getReconciliationConfig();
  await checkRateLimit({ bucket: "payment-reconciliation", identifier: paymentId, max: 1, windowSeconds: cooldownSeconds });

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

  if (payment.status === "PAID" || payment.status === "FAILED") {
    return { status: payment.status };
  }
  if (!payment.gatewayOrderId || !payment.gatewayPaymentId) {
    // Checkout hasn't been completed/verified yet — nothing to reconcile.
    return { status: payment.status };
  }

  const gatewayPayment = await getPaymentGateway().fetchPayment(payment.gatewayPaymentId);

  if (gatewayPayment.status === "captured") {
    await finalizeCapturedPayment({
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: gatewayPayment.id,
      amountSubunits: gatewayPayment.amountSubunits,
      currency: gatewayPayment.currency,
    });
    return { status: "PAID" };
  }

  if (gatewayPayment.status === "failed") {
    await recordPaymentFailure(payment.gatewayOrderId, gatewayPayment.errorCode, gatewayPayment.errorDescription);
    return { status: "FAILED" };
  }

  return { status: payment.status };
}
