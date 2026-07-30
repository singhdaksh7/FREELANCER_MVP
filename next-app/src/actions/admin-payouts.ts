"use server";

import { revalidatePath } from "next/cache";
import { adminSimulatePayoutStep } from "@/data-access/admin";
import { InvalidPayoutTransitionError, LiveProviderNotImplementedError } from "@/payouts/payout-errors";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface PayoutSimulationFormState {
  error?: string;
  success?: string;
}

/** Admin-only test-mode payout simulation trigger — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md. ADMIN role is re-verified inside adminSimulatePayoutStep, never trusted from this action layer alone. */
export async function simulatePayoutStepAction(
  _prevState: PayoutSimulationFormState,
  formData: FormData,
): Promise<PayoutSimulationFormState> {
  const entryId = String(formData.get("entryId") ?? "");
  const step = String(formData.get("step") ?? "") as "markAvailable" | "startPayout" | "completePayout" | "failPayout";
  const reason = String(formData.get("reason") ?? "") || undefined;

  try {
    await adminSimulatePayoutStep(entryId, step, reason);
    revalidatePath("/admin/payouts");
    return { success: "Payout step simulated." };
  } catch (error) {
    if (error instanceof InvalidPayoutTransitionError) return { error: error.message };
    if (error instanceof LiveProviderNotImplementedError) return { error: error.message };
    console.error("Payout simulation failed:", error);
    return { error: GENERIC_ERROR };
  }
}
