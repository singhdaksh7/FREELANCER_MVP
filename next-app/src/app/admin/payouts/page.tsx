import type { Metadata } from "next";
import Link from "next/link";
import { getAdminPayoutLedger } from "@/data-access/admin";
import { PayoutSimulationControls } from "@/components/admin/payout-simulation-controls";
import { formatINR } from "@/lib/format-currency";
import { formatDateTime } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Admin — Payouts",
};

const PAGE_SIZE = 25;

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const { rows, total } = await getAdminPayoutLedger(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Payout Ledger</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {total} entries · Test-mode payout simulation — no real funds are transferred.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs font-semibold uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Available At</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Simulate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-slate-50">
                <td className="px-4 py-3 text-ink">{row.creatorName}</td>
                <td className="px-4 py-3 text-ink-muted">{row.type}</td>
                <td className="px-4 py-3 font-semibold text-ink">{formatINR(Number(row.amountSubunits) / 100)}</td>
                <td className="px-4 py-3 text-ink-muted">{row.status}</td>
                <td className="px-4 py-3 text-ink-muted">{row.availableAt ? formatDateTime(row.availableAt) : "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">
                  {row.type === "PAYMENT_CREDIT" ? (
                    <PayoutSimulationControls entryId={row.id} status={row.status} />
                  ) : (
                    <span className="text-xs text-ink-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/admin/payouts?page=${page - 1}`} className="font-semibold text-vault-blue hover:underline">
              Previous
            </Link>
          )}
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/admin/payouts?page=${page + 1}`} className="font-semibold text-vault-blue hover:underline">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
