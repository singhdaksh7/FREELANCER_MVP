import type { Metadata } from "next";
import { AlertTriangle, Clock, CreditCard, Eye, IndianRupee, Plus } from "lucide-react";
import { getDashboardData } from "@/data-access/dashboard";
import { requireAuthenticatedUser } from "@/data-access/auth";
import { MetricCard } from "@/components/ui/metric-card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceTable } from "@/components/creator/workspace-table";
import { WorkspaceCard } from "@/components/creator/workspace-card";
import { ActivityItem } from "@/components/creator/activity-item";
import { formatINR } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";
import { paymentStatusLabel } from "@/lib/status-labels";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [creator, { summary, recentWorkspaces, recentActivity, recentPayments }] = await Promise.all([
    requireAuthenticatedUser(),
    getDashboardData(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface-card p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Welcome back, {creator.name} 👋</h1>
          <p className="mt-1 text-sm text-ink-muted">
            You have {summary.activeWorkspaceCount} active workspace
            {summary.activeWorkspaceCount === 1 ? "" : "s"} gated for client review & payment.
          </p>
        </div>
        <LinkButton href="/workspaces/new">
          <Plus size={16} aria-hidden="true" /> New Workspace Flow
        </LinkButton>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Outstanding Amount"
          value={formatINR(summary.outstandingAmount)}
          icon={Clock}
          iconColor="var(--color-warning)"
        />
        <MetricCard
          label="Received Revenue"
          value={formatINR(summary.receivedRevenue)}
          icon={IndianRupee}
          iconColor="var(--color-success)"
        />
        <MetricCard label="Awaiting Review" value={String(summary.awaitingReviewCount)} icon={Eye} />
        <MetricCard
          label="Changes Requested"
          value={String(summary.changesRequestedCount)}
          icon={AlertTriangle}
          iconColor="var(--color-danger)"
        />
        <MetricCard label="Payment Pending" value={String(summary.paymentPendingCount)} icon={CreditCard} />
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Recent Workspaces</h2>
          <LinkButton href="/workspaces" variant="ghost" className="!px-0 !py-0 text-vault-blue">
            View All Workspaces →
          </LinkButton>
        </div>
        {recentWorkspaces.length === 0 ? (
          <p className="text-sm text-ink-muted">No workspaces yet.</p>
        ) : (
          <>
            <WorkspaceTable workspaces={recentWorkspaces} caption="Most recently updated workspaces" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
              {recentWorkspaces.map((workspace) => (
                <WorkspaceCard key={workspace.id} workspace={workspace} />
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface-card p-6">
          <h2 className="mb-3 text-lg font-bold text-ink">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-ink-muted">No activity yet.</p>
          ) : (
            <ul>
              {recentActivity.map((entry) => (
                <ActivityItem
                  key={entry.id}
                  action={entry.action}
                  user={entry.actorName}
                  timestamp={formatDateTime(entry.createdAt)}
                  workspaceTitle={entry.workspaceTitle}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-line bg-surface-card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Payment Overview</h2>
            <LinkButton href="/payments" variant="ghost" className="!px-0 !py-0 text-vault-blue">
              View All Payments →
            </LinkButton>
          </div>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-ink-muted">No payments yet.</p>
          ) : (
            <ul>
              {recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-4 border-b border-line py-2.5 text-[13px] last:border-b-0"
                >
                  <div>
                    <div className="font-semibold text-ink">{payment.workspaceTitle}</div>
                    <div className="text-xs text-ink-muted">
                      {payment.clientName} · {formatDateTime(payment.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold text-ink">{formatINR(payment.amount)}</span>
                    <StatusBadge status={paymentStatusLabel(payment.status)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
