"use client";

import { useEffect, useId } from "react";
import { X, Receipt, CheckCircle, Clock, Lock } from "lucide-react";
import type { PaymentListItem } from "@/data-access/payments";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatPaymentDate, formatDateTime } from "@/lib/format-date";
import { paymentStatusLabel } from "@/lib/status-labels";

export interface PaymentDrawerProps {
  payment: PaymentListItem | null;
  onClose: () => void;
  onReceiptAction: (message: string) => void;
}

export function PaymentDrawer({ payment, onClose, onReceiptAction }: PaymentDrawerProps) {
  const dialogId = useId();

  useEffect(() => {
    if (!payment) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [payment, onClose]);

  if (!payment) return null;

  const isPaid = payment.status === "PAID";
  const maskedPaymentId = `pay_${payment.id.slice(0, 8)}...`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 transition-opacity">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-transparent cursor-default"
      />
      <div
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-label="Payment detail"
        className="animate-fade-in relative flex h-full w-full max-w-md flex-col bg-card p-6 shadow-2xl overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-primary-text">Payment Detail</h2>
            <p className="text-xs text-secondary-text">{payment.workspaceTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail drawer"
            className="rounded-lg p-2 text-secondary-text hover:bg-app-bg hover:text-primary-text"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-6 pt-6">
          {/* Main Amount Card */}
          <div className="rounded-xl border border-line bg-app-bg p-5 text-center">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Amount</span>
            <div className="mt-1 text-3xl font-black text-primary-text">{formatINR(payment.amount)}</div>
            <div className="mt-2 flex justify-center">
              <StatusBadge status={paymentStatusLabel(payment.status)} />
            </div>
          </div>

          {/* Transaction Metadata */}
          <div className="flex flex-col gap-3 rounded-xl border border-line p-4 text-sm">
            <h3 className="font-bold text-primary-text">Transaction Overview</h3>
            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-secondary-text">Workspace</dt>
              <dd className="text-right font-semibold text-primary-text">{payment.workspaceTitle}</dd>
              <dt className="text-secondary-text">Client</dt>
              <dd className="text-right font-semibold text-primary-text">{payment.clientName}</dd>
              <dt className="text-secondary-text">Provider</dt>
              <dd className="text-right text-primary-text">Razorpay</dd>
              <dt className="text-secondary-text">Reference ID</dt>
              <dd className="text-right font-mono text-muted-text">{maskedPaymentId}</dd>
              <dt className="text-secondary-text">Payment Date</dt>
              <dd className="text-right text-primary-text">{formatPaymentDate(payment.paidAt)}</dd>
              <dt className="text-secondary-text">Delivery Status</dt>
              <dd className="text-right font-medium text-success">
                {isPaid ? "Unlocked & Ready" : "Locked (Pending Payment)"}
              </dd>
            </dl>
          </div>

          {/* Action Button */}
          <button
            type="button"
            disabled={!isPaid}
            onClick={() => onReceiptAction(`Receipt for ${payment.workspaceTitle} generated.`)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary-blue px-4 py-3 font-semibold text-white hover:bg-blue-hover disabled:opacity-50"
          >
            <Receipt size={18} aria-hidden="true" /> Download Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
