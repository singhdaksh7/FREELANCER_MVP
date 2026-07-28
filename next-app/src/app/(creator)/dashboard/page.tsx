import type { Metadata } from "next";
import { AlertTriangle, Clock, CreditCard, Eye, IndianRupee, Plus } from "lucide-react";
import { CREATOR, DASHBOARD_SUMMARY, PAYMENTS, RECENT_ACTIVITY, WORKSPACES } from "@/data/mock";
import { MetricCard } from "@/components/ui/metric-card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceTable } from "@/components/creator/workspace-table";
import { WorkspaceCard } from "@/components/creator/workspace-card";
import { ActivityItem } from "@/components/creator/activity-item";
import { formatINR } from "@/lib/format-currency";
import { formatPaymentDate } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Dashboard",
};

const RECENT_WORKSPACE_COUNT = 4;
const RECENT_PAYMENT_COUNT = 3;

export default function DashboardPage() {
  const recentWorkspaces = [...WORKSPACES]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_WORKSPACE_COUNT);
  const recentPayments = PAYMENTS.slice(0, RECENT_PAYMENT_COUNT);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface-card p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Welcome back, {CREATOR.name} 👋</h1>
          <p className="mt-1 text-sm text-ink-muted">
            You have {DASHBOARD_SUMMARY.activeWorkspaceCount} active workspace
            {DASHBOARD_SUMMARY.activeWorkspaceCount === 1 ? "" : "s"} gated for client review & payment.
          </p>
        </div>
        <LinkButton href="/workspaces/new">
          <Plus size={16} aria-hidden="true" /> New Workspace Flow
        </LinkButton>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Outstanding Amount"
          value={formatINR(DASHBOARD_SUMMARY.outstandingAmount)}
          icon={Clock}
          iconColor="var(--color-warning)"
        />
        <MetricCard
          label="Received Revenue"
          value={formatINR(DASHBOARD_SUMMARY.receivedRevenue)}
          icon={IndianRupee}
          iconColor="var(--color-success)"
        />
        <MetricCard
          label="Awaiting Review"
          value={String(DASHBOARD_SUMMARY.awaitingReviewCount)}
          icon={Eye}
        />
        <MetricCard
          label="Changes Requested"
          value={String(DASHBOARD_SUMMARY.changesRequestedCount)}
          icon={AlertTriangle}
          iconColor="var(--color-danger)"
        />
        <MetricCard
          label="Payment Pending"
          value={String(DASHBOARD_SUMMARY.paymentPendingCount)}
          icon={CreditCard}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Recent Workspaces</h2>
          <LinkButton href="/workspaces" variant="ghost" className="!px-0 !py-0 text-vault-blue">
            View All Workspaces →
          </LinkButton>
        </div>
        <WorkspaceTable workspaces={recentWorkspaces} caption="Most recently updated workspaces" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
          {recentWorkspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface-card p-6">
          <h2 className="mb-3 text-lg font-bold text-ink">Recent Activity</h2>
          <ul>
            {RECENT_ACTIVITY.map((entry) => (
              <ActivityItem
                key={entry.id}
                action={entry.action}
                user={entry.user}
                timestamp={entry.timestamp}
                workspaceTitle={entry.workspaceTitle}
              />
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-surface-card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Payment Overview</h2>
            <LinkButton href="/payments" variant="ghost" className="!px-0 !py-0 text-vault-blue">
              View All Payments →
            </LinkButton>
          </div>
          <ul>
            {recentPayments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-4 border-b border-line py-2.5 text-[13px] last:border-b-0"
              >
                <div>
                  <div className="font-semibold text-ink">{payment.workspaceTitle}</div>
                  <div className="text-xs text-ink-muted">
                    {payment.clientName} · {formatPaymentDate(payment.date)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold text-ink">{formatINR(payment.amount)}</span>
                  <StatusBadge status={payment.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
