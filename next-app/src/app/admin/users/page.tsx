import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUsers } from "@/data-access/admin";
import { AdminUsersFilterBar } from "@/components/admin/admin-users-filter-bar";
import { parseQueryParam, type RawSearchParams } from "@/lib/search-params";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Admin — Users",
};

const PAGE_SIZE = 25;

function buildHref(params: RawSearchParams, page: number): string {
  const query = new URLSearchParams();
  const q = parseQueryParam(params, "q");
  if (q) query.set("q", q);
  query.set("page", String(page));
  return `/admin/users?${query.toString()}`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(parseQueryParam(params, "page")) || 1);
  const q = parseQueryParam(params, "q");
  const { rows, total } = await getAdminUsers(page, PAGE_SIZE, q);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Creators</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{total} creator accounts.</p>
      </div>

      <AdminUsersFilterBar />

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs font-semibold uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Workspaces</th>
              <th className="px-4 py-3">Captured Payments</th>
              <th className="px-4 py-3">Pending Payable</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-muted">
                  No creators match your search.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.email}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.role}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.workspaceCount}</td>
                  <td className="px-4 py-3 text-ink">{formatINR(Number(row.capturedPaymentSubunits) / 100)}</td>
                  <td className="px-4 py-3 text-ink">{formatINR(Number(row.pendingPayableSubunits) / 100)}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(row.createdAt)}</td>
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
