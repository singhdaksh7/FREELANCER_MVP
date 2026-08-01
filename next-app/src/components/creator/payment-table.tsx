import { Receipt, Eye } from "lucide-react";
import type { PaymentListItem } from "@/data-access/payments";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatPaymentDate } from "@/lib/format-date";
import { paymentStatusLabel } from "@/lib/status-labels";

export interface PaymentTableProps {
  payments: PaymentListItem[];
  caption: string;
  onSelectPayment: (payment: PaymentListItem) => void;
  onDeferredAction: (message: string) => void;
}

export function PaymentTable({ payments, caption, onSelectPayment, onDeferredAction }: PaymentTableProps) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-line bg-card md:block shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-app-bg text-[12px] font-bold uppercase tracking-wider text-secondary-text">
            <th scope="col" className="px-6 py-3.5">Workspace</th>
            <th scope="col" className="px-6 py-3.5">Client</th>
            <th scope="col" className="px-6 py-3.5">Amount</th>
            <th scope="col" className="px-6 py-3.5">Status</th>
            <th scope="col" className="px-6 py-3.5">Payment Date</th>
            <th scope="col" className="px-6 py-3.5">Delivery</th>
            <th scope="col" className="px-6 py-3.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {payments.map((payment) => {
            const isPaid = payment.status === "PAID";
            return (
              <tr
                key={payment.id}
                onClick={() => onSelectPayment(payment)}
                className="cursor-pointer transition-colors hover:bg-soft-blue/30"
              >
                <td className="px-6 py-4 font-bold text-primary-text">{payment.workspaceTitle}</td>
                <td className="px-6 py-4 text-primary-text">{payment.clientName}</td>
                <td className="px-6 py-4 font-extrabold text-primary-text">{formatINR(payment.amount)}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={paymentStatusLabel(payment.status)} />
                </td>
                <td className="px-6 py-4 text-xs text-secondary-text">{formatPaymentDate(payment.paidAt)}</td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-semibold ${isPaid ? "text-success" : "text-warning"}`}>
                    {isPaid ? "Unlocked" : "Locked"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onSelectPayment(payment)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-primary-text hover:bg-app-bg"
                  >
                    <Eye size={13} aria-hidden="true" /> Details
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
