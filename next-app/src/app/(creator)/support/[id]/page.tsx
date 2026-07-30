import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedSupportTicket, SupportTicketNotFoundError } from "@/data-access/support-tickets";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportTicketReplyForm } from "@/components/creator/support-ticket-reply-form";
import { formatDateTime } from "@/lib/format-date";
import { supportTicketStatusLabel, supportTicketCategoryLabel } from "@/lib/status-labels";

export const metadata: Metadata = {
  title: "Support Ticket",
};

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let ticket;
  try {
    ticket = await getOwnedSupportTicket(id);
  } catch (error) {
    if (error instanceof SupportTicketNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/support" className="text-sm font-semibold text-vault-blue hover:underline">
          &larr; Back to Support
        </Link>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-muted">{ticket.ticketNumber}</p>
            <h1 className="text-xl font-extrabold text-ink">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {supportTicketCategoryLabel(ticket.category)}
              {ticket.workspaceTitle ? ` · ${ticket.workspaceTitle}` : ""}
            </p>
          </div>
          <StatusBadge status={supportTicketStatusLabel(ticket.status)} />
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink">{ticket.description}</p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-6">
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
                    {message.authorType === "ADMIN" ? "Support" : message.authorType === "CREATOR" ? "You" : "Client"} ·{" "}
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{message.body}</p>
              </li>
            ))}
          </ul>
        )}

        {ticket.status !== "CLOSED" && <SupportTicketReplyForm ticketId={ticket.id} />}
      </div>
    </div>
  );
}
