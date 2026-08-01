"use client";

import { useState } from "react";
import { Clock, IndianRupee, SearchX } from "lucide-react";
import type { PaymentListItem, PaymentSummary } from "@/data-access/payments";
import { FilterSelect } from "@/components/ui/filter-select";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { useToastMessage } from "@/hooks/use-toast-message";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { PAYMENT_DATE_RANGE_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/lib/filter-options";
import { formatINR } from "@/lib/format-currency";
import { PaymentTable } from "./payment-table";
import { PaymentCard } from "./payment-card";
import { PaymentDrawer } from "./payment-drawer";

export interface PaymentExplorerProps {
  payments: PaymentListItem[];
  summary: PaymentSummary;
  hasAnyPayments: boolean;
}

export function PaymentExplorer({ payments, summary, hasAnyPayments }: PaymentExplorerProps) {
  const { getParam, setParam } = useUrlFilters();
  const { toast, showToast } = useToastMessage();
  const [selectedPayment, setSelectedPayment] = useState<PaymentListItem | null>(null);

  const activeTab = getParam("status", "All");

  const tabs = ["All", "Pending", "Paid", "Failed", "Refunded"];

  return (
    <div className="flex flex-col gap-6">
      {/* Financial Summary */}
      <section className="rounded-xl border border-line bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-primary-text">Financial Overview</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
          <div className="flex flex-col gap-1 border-r-0 border-line pb-4 sm:border-r sm:pb-0 sm:pr-6">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Total Received</span>
            <span className="text-2xl font-black text-success">{formatINR(summary.totalReceived)}</span>
          </div>
          <div className="flex flex-col gap-1 border-r-0 border-line pb-4 sm:border-r sm:pb-0 sm:pr-6">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Outstanding</span>
            <span className="text-2xl font-black text-warning">{formatINR(summary.outstandingAmount)}</span>
          </div>
          <div className="flex flex-col gap-1 border-r-0 border-line pb-4 sm:border-r sm:pb-0 sm:pr-6">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Paid Projects</span>
            <span className="text-2xl font-black text-primary-text">
              {payments.filter(p => p.status === "PAID").length}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Pending Payments</span>
            <span className="text-2xl font-black text-primary-text">
              {payments.filter(p => p.status === "PENDING" || p.status === "CREATED").length}
            </span>
          </div>
        </div>
      </section>

      {/* Tabs & Date Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-2">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = activeTab.toLowerCase() === t.toLowerCase() || (t === "All" && activeTab === "All");
            return (
              <button
                key={t}
                type="button"
                onClick={() => setParam("status", t === "All" ? "All" : t.toUpperCase())}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-primary-blue text-white"
                    : "bg-card text-secondary-text hover:bg-app-bg"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>

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
            onSelectPayment={(payment) => setSelectedPayment(payment)}
            onDeferredAction={(message) => showToast(message, "info")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {payments.map((payment) => (
              <div key={payment.id} onClick={() => setSelectedPayment(payment)} className="cursor-pointer">
                <PaymentCard
                  payment={payment}
                  onDeferredAction={(message) => showToast(message, "info")}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Detail Drawer */}
      <PaymentDrawer
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
        onReceiptAction={(msg) => showToast(msg, "success")}
      />

      <Toast toast={toast} />
    </div>
  );
}
