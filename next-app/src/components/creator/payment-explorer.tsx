"use client";

import { Clock, IndianRupee, Receipt, SearchX } from "lucide-react";
import type { PaymentListItem, PaymentSummary } from "@/data-access/payments";
import { FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Toast } from "@/components/ui/toast";
import { useToastMessage } from "@/hooks/use-toast-message";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { PAYMENT_DATE_RANGE_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/filter-options";
import { formatINR } from "@/lib/format-currency";
import { PaymentTable } from "./payment-table";
import { PaymentCard } from "./payment-card";

export interface PaymentExplorerProps {
  /** Already filtered server-side by the current `status`/`date` params — see src/data-access/payments.ts. */
  payments: PaymentListItem[];
  summary: PaymentSummary;
  hasAnyPayments: boolean;
}

export function PaymentExplorer({ payments, summary, hasAnyPayments }: PaymentExplorerProps) {
  const { getParam, setParam } = useUrlFilters();
  const { toast, showToast } = useToastMessage();

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Total Received"
          value={formatINR(summary.totalReceived)}
          icon={IndianRupee}
          iconColor="var(--color-success)"
          helperText="Net of platform fees"
        />
        <MetricCard
          label="Outstanding Amount"
          value={formatINR(summary.outstandingAmount)}
          icon={Clock}
          iconColor="var(--color-warning)"
          helperText="Not yet settled"
        />
        <MetricCard label="Platform Fees" value={formatINR(summary.totalFees)} icon={Receipt} />
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface-card p-4">
        <FilterSelect
          value={getParam("status", "All")}
          onChange={(value) => setParam("status", value)}
          options={PAYMENT_STATUS_OPTIONS}
          aria-label="Filter by payment status"
        />
        <FilterSelect
          value={getParam("date", "all")}
          onChange={(value) => setParam("date", value, ["all", ""])}
          options={PAYMENT_DATE_RANGE_OPTIONS}
          aria-label="Filter by date range"
        />
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={hasAnyPayments ? "No transactions match your filters" : "No payments yet"}
          description={
            hasAnyPayments
              ? "Try a different status or date range."
              : "Payments for your workspaces will appear here once a client pays."
          }
        />
      ) : (
        <>
          <PaymentTable
            payments={payments}
            caption="Payments matching the current filters"
            onDeferredAction={(message) => showToast(message, "info")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {payments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onDeferredAction={(message) => showToast(message, "info")}
              />
            ))}
          </div>
        </>
      )}

      <Toast toast={toast} />
    </div>
  );
}
