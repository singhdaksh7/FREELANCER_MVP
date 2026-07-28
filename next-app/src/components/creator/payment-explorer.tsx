"use client";

import { useState } from "react";
import { Clock, IndianRupee, Receipt, SearchX } from "lucide-react";
import type { Payment, PaymentStatus } from "@/types";
import { FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Toast } from "@/components/ui/toast";
import { useToastMessage } from "@/hooks/use-toast-message";
import { formatINR } from "@/lib/format-currency";
import { computePaymentSummary } from "@/lib/payment-metrics";
import { demoDaysAgo } from "@/lib/demo-clock";
import { PaymentTable } from "./payment-table";
import { PaymentCard } from "./payment-card";

export interface PaymentExplorerProps {
  payments: Payment[];
}

const STATUS_OPTIONS: { label: string; value: "All" | PaymentStatus }[] = [
  { label: "All Statuses", value: "All" },
  { label: "Completed", value: "Completed" },
  { label: "Pending Approval", value: "Pending Approval" },
  { label: "In Review", value: "In Review" },
];

const DATE_OPTIONS = [
  { label: "All Time", value: "all" },
  { label: "Last 7 Days", value: "7" },
  { label: "Last 30 Days", value: "30" },
] as const;

export function PaymentExplorer({ payments }: PaymentExplorerProps) {
  const [status, setStatus] = useState<"All" | PaymentStatus>("All");
  const [dateRange, setDateRange] = useState<(typeof DATE_OPTIONS)[number]["value"]>("all");
  const { toast, showToast } = useToastMessage();

  const summary = computePaymentSummary(payments);

  const filtered = payments.filter((payment) => {
    const matchesStatus = status === "All" || payment.status === status;
    const matchesDate =
      dateRange === "all" ||
      (payment.date !== null && payment.date >= demoDaysAgo(Number(dateRange)));
    return matchesStatus && matchesDate;
  });

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
          value={status}
          onChange={(value) => setStatus(value as "All" | PaymentStatus)}
          options={STATUS_OPTIONS}
          aria-label="Filter by payment status"
        />
        <FilterSelect
          value={dateRange}
          onChange={(value) => setDateRange(value as (typeof DATE_OPTIONS)[number]["value"])}
          options={[...DATE_OPTIONS]}
          aria-label="Filter by date range"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No transactions match your filters"
          description="Try a different status or date range."
        />
      ) : (
        <>
          <PaymentTable
            payments={filtered}
            caption="Payments matching the current filters"
            onDeferredAction={(message) => showToast(message, "info")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {filtered.map((payment) => (
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
