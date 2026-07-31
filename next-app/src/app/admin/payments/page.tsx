import type { Metadata } from "next";
import Link from "next/link";
import { getAdminPayments } from "@/data-access/admin";
import { AdminPaymentsFilterBar } from "@/components/admin/admin-payments-filter-bar";
import { parseQueryParam, parseEnumParam, type RawSearchParams } from "@/lib/search-params";
import { PaymentStatus } from "@/generated/prisma/enums";
import { paymentStatusLabel } from "@/lib/status-labels";
import { formatINR } from "@/lib/format-currency";
import { formatDateTime, formatPaymentDate } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Admin — Payments",
};

const PAGE_SIZE = 25;
const STATUS_FILTER_VALUES = ["All", ...Object.values(PaymentStatus)] as const;

function buildHref(params: RawSearchParams, page: number): string {
  const query = new URLSearchParams();
  const q = parseQueryParam(params, "q");
  const status = parseEnumParam(params, "status", STATUS_FILTER_VALUES, "All");
  if (q) query.set("q", q);
  if (status !== "All") query.set("status", status);
  query.set("page", String(page));
  return `/admin/payments?${query.toString()}`;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(parseQueryParam(params, "page")) || 1);
  const q = parseQueryParam(params, "q");
  const status = parseEnumParam(params, "status", STATUS_FILTER_VALUES, "All");
  const { rows, total } = await getAdminPayments(page, PAGE_SIZE, { q, status });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Payments</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{total} payment records.</p>
      </div>

      <AdminPaymentsFilterBar />

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs font-semibold uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Workspace</th>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Gateway Status</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Captured</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-ink-muted">
                  No payments match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted">{row.id}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{row.workspaceTitle}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.creatorName}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.clientName}</td>
                  <td className="px-4 py-3 text-ink">{formatINR(Number(row.grossAmountSubunits) / 100)}</td>
                  <td className="px-4 py-3 text-ink-muted">{paymentStatusLabel(row.gatewayStatus)}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.deliveryStatus}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatPaymentDate(row.capturedAt)}</td>
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
