import type { Metadata } from "next";
import Link from "next/link";
import { getAdminWorkspaces } from "@/data-access/admin";
import { AdminWorkspacesFilterBar } from "@/components/admin/admin-workspaces-filter-bar";
import { parseQueryParam, parseEnumParam, type RawSearchParams } from "@/lib/search-params";
import { WorkspaceStatus, DeliveryMode } from "@/generated/prisma/enums";
import { workspaceStatusLabel, deliveryModeLabel } from "@/lib/status-labels";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Admin — Workspaces",
};

const PAGE_SIZE = 25;
const STATUS_FILTER_VALUES = ["All", ...Object.values(WorkspaceStatus)] as const;
const DELIVERY_MODE_FILTER_VALUES = ["All", ...Object.values(DeliveryMode)] as const;

/** Display-only — derived from the latest review link's own status/expiry plus the workspace's terminal status, never a stored column. */
function reviewLinkStateLabel(status: string | null, expiresAt: string | null, workspaceStatus: string): string {
  if (!status) return "No link";
  if (workspaceStatus === "DELIVERED" || workspaceStatus === "CLOSED") return "Read-only (Completed)";
  if (status === "REVOKED") return "Revoked";
  if (expiresAt && new Date(expiresAt) < new Date()) return "Expired";
  return "Active";
}

function buildHref(params: RawSearchParams, page: number): string {
  const query = new URLSearchParams();
  const q = parseQueryParam(params, "q");
  const status = parseEnumParam(params, "status", STATUS_FILTER_VALUES, "All");
  const deliveryMode = parseEnumParam(params, "deliveryMode", DELIVERY_MODE_FILTER_VALUES, "All");
  if (q) query.set("q", q);
  if (status !== "All") query.set("status", status);
  if (deliveryMode !== "All") query.set("deliveryMode", deliveryMode);
  query.set("page", String(page));
  return `/admin/workspaces?${query.toString()}`;
}

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(parseQueryParam(params, "page")) || 1);
  const q = parseQueryParam(params, "q");
  const status = parseEnumParam(params, "status", STATUS_FILTER_VALUES, "All");
  const deliveryMode = parseEnumParam(params, "deliveryMode", DELIVERY_MODE_FILTER_VALUES, "All");
  const { rows, total } = await getAdminWorkspaces(page, PAGE_SIZE, { q, status, deliveryMode });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Workspaces</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{total} workspaces.</p>
      </div>

      <AdminWorkspacesFilterBar />

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs font-semibold uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Delivery Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Files</th>
              <th className="px-4 py-3">Review Link</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-ink-muted">
                  No workspaces match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-ink">{row.title}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.creatorName}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.clientName}</td>
                  <td className="px-4 py-3 text-ink-muted">{deliveryModeLabel(row.deliveryMode)}</td>
                  <td className="px-4 py-3 text-ink-muted">{workspaceStatusLabel(row.status)}</td>
                  <td className="px-4 py-3 text-ink">{formatINR(row.amount)}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.fileCount}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {reviewLinkStateLabel(row.reviewLinkStatus, row.reviewLinkExpiresAt, row.status)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(row.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={buildHref(params, page - 1)} className="font-semibold text-vault-blue hover:underline">
              Previous
            </Link>
          )}
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildHref(params, page + 1)} className="font-semibold text-vault-blue hover:underline">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
