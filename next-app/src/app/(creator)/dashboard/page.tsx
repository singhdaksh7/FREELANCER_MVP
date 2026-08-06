import type { Metadata } from "next";
import { AlertCircle, Clock, CheckCircle2, FileText } from "lucide-react";
import { getDashboardData } from "@/data-access/dashboard";
import { requireAuthenticatedUser } from "@/data-access/auth";
import { LinkButton } from "@/components/ui/link-button";
import { WorkspaceCard } from "@/components/creator/workspace-card";
import { formatINR } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [creator, { summary, recentWorkspaces }] = await Promise.all([
    requireAuthenticatedUser(),
    getDashboardData(),
  ]);

  // Derived counts for attention cards
  const processingCount = recentWorkspaces.filter(w => w.status === "PREVIEW_PROCESSING" || w.status === "DRAFT").length;
  const awaitingResponseCount = summary.changesRequestedCount;
  const approvedWaitingPaymentCount = summary.paymentPendingCount;
  const readyToReleaseCount = recentWorkspaces.filter(w => w.status === "AWAITING_CREATOR_RELEASE" || w.status === "FILES_UNLOCKED" || w.status === "PAID").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-text">Good evening, {creator.name}</h1>
          <p className="mt-1 text-sm text-secondary-text">
            Here’s what needs your attention across your active workspaces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LinkButton href="/workspaces" variant="secondary" size="md">
            View All Workspaces
          </LinkButton>
          <LinkButton href="/workspaces/new" variant="primary" size="md">
            New Workspace
          </LinkButton>
        </div>
      </div>

      {/* Needs Your Attention Section */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-primary-text">Needs Your Attention</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-bg text-warning">
                <FileText size={20} aria-hidden="true" />
              </div>
              <span className="text-xl font-bold text-primary-text">{processingCount}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-text">Files Processing</div>
              <p className="mt-0.5 text-xs text-secondary-text">Previews generating or processing uploads</p>
            </div>
            <LinkButton href="/workspaces" variant="ghost" size="md" className="!justify-start !px-0 !py-1 text-xs text-primary-blue">
              Check files status →
            </LinkButton>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger-bg text-danger">
                <AlertCircle size={20} aria-hidden="true" />
              </div>
              <span className="text-xl font-bold text-primary-text">{awaitingResponseCount}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-text">Awaiting Your Response</div>
              <p className="mt-0.5 text-xs text-secondary-text">Clients submitted revision requests</p>
            </div>
            <LinkButton href="/workspaces?status=CHANGES_REQUESTED" variant="ghost" size="md" className="!justify-start !px-0 !py-1 text-xs text-primary-blue">
              Review feedback →
            </LinkButton>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-soft-blue text-primary-blue">
                <Clock size={20} aria-hidden="true" />
              </div>
              <span className="text-xl font-bold text-primary-text">{approvedWaitingPaymentCount}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-text">Approved & Pending Payment</div>
              <p className="mt-0.5 text-xs text-secondary-text">Work approved, waiting client payment</p>
            </div>
            <LinkButton href="/payments?status=PENDING" variant="ghost" size="md" className="!justify-start !px-0 !py-1 text-xs text-primary-blue">
              View pending payouts →
            </LinkButton>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-bg text-success">
                <CheckCircle2 size={20} aria-hidden="true" />
              </div>
              <span className="text-xl font-bold text-primary-text">{readyToReleaseCount}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-primary-text">Deliveries Ready</div>
              <p className="mt-0.5 text-xs text-secondary-text">Paid projects ready for client download</p>
            </div>
            <LinkButton href="/workspaces?status=PAID" variant="ghost" size="md" className="!justify-start !px-0 !py-1 text-xs text-primary-blue">
              View deliveries →
            </LinkButton>
          </div>
        </div>
      </section>

      {/* Financial Summary */}
      <section className="rounded-xl border border-line bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-primary-text">Financial Summary</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-1 border-r-0 border-line pb-4 sm:border-r sm:pb-0 sm:pr-6">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Outstanding</span>
            <span className="text-3xl font-black text-primary-text">{formatINR(summary.outstandingAmount)}</span>
            <span className="text-xs text-muted-text">Pending across active links</span>
          </div>
          <div className="flex flex-col gap-1 border-r-0 border-line pb-4 sm:border-r sm:pb-0 sm:pr-6">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Received This Month</span>
            <span className="text-3xl font-black text-success">{formatINR(summary.receivedRevenue)}</span>
            <span className="text-xs text-muted-text">Settled payouts</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Paid Projects</span>
            <span className="text-3xl font-black text-primary-text">{summary.totalWorkspaceCount - summary.activeWorkspaceCount}</span>
            <span className="text-xs text-muted-text">Completed deliverables</span>
          </div>
        </div>
      </section>

      {/* Active Workspaces */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary-text">Active Workspaces</h2>
          <LinkButton href="/workspaces" variant="ghost" size="md" className="!px-0 !py-0 text-primary-blue font-semibold">
            View All Workspaces →
          </LinkButton>
        </div>

        {recentWorkspaces.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-6 text-center text-sm text-secondary-text">
            No workspaces yet. Click &quot;New Workspace&quot; above to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentWorkspaces.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
