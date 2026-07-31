import type { Metadata } from "next";
import { getAdminDashboardStats } from "@/data-access/admin";
import { formatINR } from "@/lib/format-currency";

export const metadata: Metadata = {
  title: "Admin Dashboard",
};

function subunitsToRupees(subunits: bigint): number {
  return Number(subunits) / 100;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
        <p className="mt-0.5 text-sm text-ink-muted">Database-backed platform overview — read-only.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Creators" value={String(stats.totalCreators)} />
        <StatCard label="Active Workspaces" value={String(stats.activeWorkspaces)} />
        <StatCard label="Payments Captured" value={`${stats.paymentsCapturedCount} (${formatINR(subunitsToRupees(stats.paymentsCapturedSubunits))})`} />
        <StatCard label="Pending Freelancer Payable" value={formatINR(subunitsToRupees(stats.pendingFreelancerPayableSubunits))} />
        <StatCard label="File Processing Failures" value={String(stats.fileProcessingFailures)} />
      </div>
    </div>
  );
}
