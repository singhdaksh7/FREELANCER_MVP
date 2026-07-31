"use client";

import { useActionState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";
import { paymentStatusLabel } from "@/lib/status-labels";
import { retryDeliveryPreparationAction, refreshPaymentStatusAction, type PaymentActionState } from "@/actions/payments";
import type { WorkspacePaymentEntry } from "@/data-access/workspaces";

const INITIAL_STATE: PaymentActionState = {};

export interface PaymentStatusCardProps {
  workspaceId: string;
  payment: WorkspacePaymentEntry;
}

/**
 * Real payment/delivery status for the creator's Payment tab — see
 * PAYMENT_ARCHITECTURE.md. Never shows a "mark as paid" control — a
 * creator can only ever request a safe status refresh (which routes
 * through the same reconcilePaymentStatus service the client polling
 * endpoint uses) or retry a failed delivery preparation.
 */
export function PaymentStatusCard({ workspaceId, payment }: PaymentStatusCardProps) {
  const [retryState, retryAction, retryPending] = useActionState(retryDeliveryPreparationAction, INITIAL_STATE);
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshPaymentStatusAction, INITIAL_STATE);

  const showRetry = payment.delivery?.bundleStatus === "FAILED";
  const showRefresh = payment.status === "CREATED" || payment.status === "PENDING";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-ink">{formatINR(payment.amount)}</div>
          <div className="text-xs text-ink-muted">
            {payment.paidAt ? `Captured ${formatDateTime(payment.paidAt)}` : `Created ${formatDateTime(payment.createdAt)}`}
          </div>
          {payment.gatewayOrderId && <div className="mt-1 text-xs text-ink-muted">Order: {payment.gatewayOrderId}</div>}
          {payment.failureReason && <div className="mt-1 text-xs text-danger">{payment.failureReason}</div>}
        </div>
        <StatusBadge status={paymentStatusLabel(payment.status)} />
      </div>

      {payment.delivery && (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-xs">
          <div>
            <span className="font-semibold text-ink">Delivery: </span>
            <span className="text-ink-muted">
              {payment.delivery.bundleStatus === "READY"
                ? "Files unlocked"
                : payment.delivery.bundleStatus === "FAILED"
                  ? "Preparation failed"
                  : "Preparing files…"}
            </span>
            {payment.delivery.grantStatus && (
              <span className="ml-2 text-ink-muted">
                {payment.delivery.downloadCount}/{payment.delivery.maxDownloads} downloads
                {payment.delivery.grantExpiresAt ? ` · expires ${formatDateTime(payment.delivery.grantExpiresAt)}` : ""}
              </span>
            )}
          </div>
          {showRetry && (
            <form action={retryAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="paymentId" value={payment.id} />
              <button
                type="submit"
                disabled={retryPending}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw size={12} aria-hidden="true" /> {retryPending ? "Retrying…" : "Retry"}
              </button>
            </form>
          )}
        </div>
      )}

      {showRefresh && (
        <form action={refreshAction} className="border-t border-line pt-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="paymentId" value={payment.id} />
          <button
            type="submit"
            disabled={refreshPending}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={12} aria-hidden="true" /> {refreshPending ? "Refreshing…" : "Refresh Status"}
          </button>
        </form>
      )}

      {(retryState.error || retryState.success) && (
        <p className={`text-xs ${retryState.error ? "text-danger" : "text-success"}`}>{retryState.error ?? retryState.success}</p>
      )}
      {(refreshState.error || refreshState.success) && (
        <p className={`text-xs ${refreshState.error ? "text-danger" : "text-success"}`}>{refreshState.error ?? refreshState.success}</p>
      )}
    </div>
  );
}
