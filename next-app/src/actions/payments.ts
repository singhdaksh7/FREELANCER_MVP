"use server";

import { revalidatePath } from "next/cache";
import { retryDeliveryPreparation, DeliveryNotRetryableError, DeliveryRetryLimitReachedError } from "@/data-access/delivery-retry";
import { reconcilePaymentStatus } from "@/data-access/payment-reconciliation";
import { requireOwnedWorkspace } from "@/data-access/authorization";
import { OwnershipError } from "@/data-access/authorization";
import { RateLimitExceededError } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface PaymentActionState {
  error?: string;
  success?: string;
}

/**
 * Creator-only retry for a permanently-failed delivery-bundle build — see
 * SECURE_DOWNLOAD_ARCHITECTURE.md. There is deliberately no equivalent
 * action for a captured payment itself (payments are never manually
 * marked successful — see PAYMENT_ARCHITECTURE.md).
 */
export async function retryDeliveryPreparationAction(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");

  try {
    await retryDeliveryPreparation(workspaceId, paymentId);
  } catch (error) {
    if (error instanceof DeliveryNotRetryableError) return { error: error.message };
    if (error instanceof DeliveryRetryLimitReachedError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Delivery retry failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "Delivery preparation restarted." };
}

/** A creator's safe, rate-limited "refresh payment status" action — routes through the exact same reconcilePaymentStatus service the client polling endpoint uses, never a separate state-changing path. */
export async function refreshPaymentStatusAction(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");

  try {
    await requireOwnedWorkspace(workspaceId);
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, workspaceId } });
    if (!payment) return { error: "This payment could not be found." };
    await reconcilePaymentStatus(paymentId);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Payment status refresh failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "Payment status refreshed." };
}
