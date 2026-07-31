import { Receipt } from "lucide-react";
import type { PaymentListItem } from "@/data-access/payments";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatPaymentDate } from "@/lib/format-date";
import { paymentStatusLabel } from "@/lib/status-labels";

export interface PaymentTableProps {
  payments: PaymentListItem[];
  caption: string;
  onDeferredAction: (message: string) => void;
}

/** Desktop payments ledger. Status colors come from the shared StatusBadge/status-config, not a page-local map. */
export function PaymentTable({ payments, caption, onDeferredAction }: PaymentTableProps) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface-card md:block">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-slate-50 text-[12px] uppercase text-ink-muted">
            <th scope="col" className="px-6 py-3 font-medium">Transaction</th>
            <th scope="col" className="px-6 py-3 font-medium">Workspace</th>
            <th scope="col" className="px-6 py-3 font-medium">Client</th>
            <th scope="col" className="px-6 py-3 font-medium">Amount</th>
            <th scope="col" className="px-6 py-3 font-medium">Date</th>
            <th scope="col" className="px-6 py-3 font-medium">Status</th>
            <th scope="col" className="px-6 py-3 text-right font-medium">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const isPaid = payment.status === "PAID";
            return (
              <tr key={payment.id} className="border-b border-line last:border-b-0">
                <td className="px-6 py-4 font-medium text-ink-muted">{payment.id}</td>
                <td className="px-6 py-4 font-semibold text-ink">{payment.workspaceTitle}</td>
                <td className="px-6 py-4 text-ink">{payment.clientName}</td>
                <td className="px-6 py-4 font-semibold text-ink">{formatINR(payment.amount)}</td>
                <td className="px-6 py-4 text-xs text-ink-muted">{formatPaymentDate(payment.paidAt)}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={paymentStatusLabel(payment.status)} />
                </td>
                <td className="px-6 py-4 text-right">
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
                    className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Receipt size={13} aria-hidden="true" /> Receipt
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
