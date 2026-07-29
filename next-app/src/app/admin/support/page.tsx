import type { Metadata } from "next";
import Link from "next/link";
import { getAdminSupportTickets } from "@/data-access/support-tickets";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format-date";
import { supportTicketStatusLabel, supportTicketCategoryLabel } from "@/lib/status-labels";

export const metadata: Metadata = {
  title: "Admin — Support",
};

const PAGE_SIZE = 25;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const { rows, total } = await getAdminSupportTickets(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Support Tickets</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{total} total</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No support tickets yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs font-semibold uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ticket) => (
                <tr key={ticket.id} className="border-b border-line last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/support/${ticket.id}`} className="font-semibold text-vault-blue hover:underline">
                      {ticket.ticketNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{ticket.subject}</td>
                  <td className="px-4 py-3 text-ink-muted">{supportTicketCategoryLabel(ticket.category)}</td>
                  <td className="px-4 py-3 text-ink-muted">{ticket.workspaceTitle ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={supportTicketStatusLabel(ticket.status)} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{formatDateTime(ticket.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/admin/support?page=${page - 1}`} className="font-semibold text-vault-blue hover:underline">
              Previous
            </Link>
          )}
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/admin/support?page=${page + 1}`} className="font-semibold text-vault-blue hover:underline">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
