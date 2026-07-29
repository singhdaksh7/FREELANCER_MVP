import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { getOwnedSupportTickets } from "@/data-access/support-tickets";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";
import { supportTicketStatusLabel, supportTicketCategoryLabel } from "@/lib/status-labels";

export const metadata: Metadata = {
  title: "Support",
};

export default async function SupportPage() {
  const tickets = await getOwnedSupportTickets();

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Support"
        description="Raise and track support tickets for your workspaces"
        action={
          <Link href="/support/new">
            <Button>Raise a Ticket</Button>
          </Link>
        }
      />

      {tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets yet"
          description="Tickets you raise, or that a client raises through their review link, will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface-card">
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
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-line last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/support/${ticket.id}`} className="font-semibold text-vault-blue hover:underline">
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
    </div>
  );
}
