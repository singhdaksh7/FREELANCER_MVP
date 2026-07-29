import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupportTicket, SupportTicketNotFoundError } from "@/data-access/support-tickets";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTicketReplyForm, AdminTicketStatusForm } from "@/components/admin/admin-ticket-controls";
import { formatDateTime } from "@/lib/format-date";
import { supportTicketStatusLabel, supportTicketCategoryLabel } from "@/lib/status-labels";

export const metadata: Metadata = {
  title: "Admin — Support Ticket",
};

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;

  let ticket;
  try {
    ticket = await getAdminSupportTicket(ticketId);
  } catch (error) {
    if (error instanceof SupportTicketNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/support" className="text-sm font-semibold text-vault-blue hover:underline">
        &larr; Back to Support Tickets
      </Link>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-muted">{ticket.ticketNumber}</p>
            <h1 className="text-xl font-extrabold text-ink">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {supportTicketCategoryLabel(ticket.category)}
              {ticket.workspaceTitle ? ` · ${ticket.workspaceTitle}` : ""}
              {ticket.reviewerName ? ` · raised by ${ticket.reviewerName}` : ""}
            </p>
          </div>
          <StatusBadge status={supportTicketStatusLabel(ticket.status)} />
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink">{ticket.description}</p>
        <AdminTicketStatusForm ticketId={ticket.id} currentStatus={ticket.status} />
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6">
        <h2 className="text-sm font-bold text-ink">Conversation</h2>
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-ink-muted">No replies yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ticket.messages.map((message) => (
              <li key={message.id} className="rounded-md border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{message.authorName}</span>
                  <span className="text-xs text-ink-muted">
                    {message.authorType} · {formatDateTime(message.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
        <AdminTicketReplyForm ticketId={ticket.id} />
      </div>
    </div>
  );
}
