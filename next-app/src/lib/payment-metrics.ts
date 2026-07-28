import type { Payment } from "@/types";

export interface PaymentSummary {
  totalReceived: number;
  outstandingAmount: number;
  totalFees: number;
}

/** Derived from payment mock records — never hardcoded in the UI. */
export function computePaymentSummary(payments: Payment[]): PaymentSummary {
  const completed = payments.filter((p) => p.status === "Completed");
  const pending = payments.filter((p) => p.status !== "Completed");

  return {
    totalReceived: completed.reduce((sum, p) => sum + p.netAmount, 0),
    outstandingAmount: pending.reduce((sum, p) => sum + p.amount, 0),
    totalFees: completed.reduce((sum, p) => sum + p.fee, 0),
  };
}
