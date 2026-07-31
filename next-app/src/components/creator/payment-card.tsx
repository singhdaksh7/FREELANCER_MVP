import { Receipt } from "lucide-react";
import type { PaymentListItem } from "@/data-access/payments";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatPaymentDate } from "@/lib/format-date";
import { paymentStatusLabel } from "@/lib/status-labels";

export interface PaymentCardProps {
  payment: PaymentListItem;
  onDeferredAction: (message: string) => void;
}

export function PaymentCard({ payment, onDeferredAction }: PaymentCardProps) {
  const isPaid = payment.status === "PAID";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">{payment.workspaceTitle}</h3>
          <p className="mt-0.5 text-xs text-ink-muted">{payment.clientName}</p>
        </div>
        <StatusBadge status={paymentStatusLabel(payment.status)} />
      </div>

      <dl className="grid grid-cols-2 gap-y-1.5 border-t border-line pt-3 text-[13px]">
        <dt className="text-ink-muted">Amount</dt>
        <dd className="text-right font-semibold text-ink">{formatINR(payment.amount)}</dd>
        <dt className="text-ink-muted">Date</dt>
        <dd className="text-right text-ink">{formatPaymentDate(payment.paidAt)}</dd>
      </dl>

      <button
        type="button"
        disabled={!isPaid}
        onClick={() =>
          onDeferredAction(`Receipts for ${payment.workspaceTitle} are available in a later phase.`)
        }
        title={
          isPaid
            ? "Receipts are available in a later phase"
            : "Receipts are only available for completed payments"
        }
        className="flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Receipt size={13} aria-hidden="true" /> Receipt
      </button>
    </div>
  );
}
