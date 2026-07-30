"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LifeBuoy, X } from "lucide-react";
import {
  createClientSupportTicketAction,
  addClientSupportMessageAction,
  type SupportTicketFormState,
  type SupportTicketMessageFormState,
} from "@/actions/support-tickets";
import { SUPPORT_TICKET_CATEGORIES } from "@/validation/support-ticket";
import { supportTicketCategoryLabel, supportTicketStatusLabel } from "@/lib/status-labels";
import type { SupportTicketSummary } from "@/data-access/support-tickets";

const CREATE_INITIAL: SupportTicketFormState = {};
const MESSAGE_INITIAL: SupportTicketMessageFormState = {};

export interface ClientSupportModalProps {
  token: string;
  tickets: SupportTicketSummary[];
  reviewerName: string;
}

function CreateTicketForm({ token, reviewerName, onCreated }: { token: string; reviewerName: string; onCreated: () => void }) {
  const [state, action, pending] = useActionState(createCreatorSupportTicketActionAdapter, CREATE_INITIAL);
  useEffect(() => {
    if (state.ticketId) onCreated();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  return (
    <form action={action} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="reviewerName" value={reviewerName || "Reviewer"} />
      {state.error && <p className="rounded-md bg-danger-bg px-3 py-2 text-xs font-medium text-danger">{state.error}</p>}
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-muted">Category</label>
        <select name="category" required defaultValue="" className="w-full rounded-md border border-line px-3 py-2 text-sm">
          <option value="" disabled>
            Select a category
          </option>
          {SUPPORT_TICKET_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {supportTicketCategoryLabel(category)}
            </option>
          ))}
        </select>
        {state.fieldErrors?.category && <p className="mt-1 text-xs text-danger">{state.fieldErrors.category[0]}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-muted">Subject</label>
        <input name="subject" maxLength={150} required className="w-full rounded-md border border-line px-3 py-2 text-sm" />
        {state.fieldErrors?.subject && <p className="mt-1 text-xs text-danger">{state.fieldErrors.subject[0]}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-muted">Describe the issue</label>
        <textarea name="description" rows={4} maxLength={4000} required className="w-full rounded-md border border-line px-3 py-2 text-sm" />
        {state.fieldErrors?.description && <p className="mt-1 text-xs text-danger">{state.fieldErrors.description[0]}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit Ticket"}
      </button>
    </form>
  );
}

// Named indirection so the form action's type matches exactly what useActionState expects.
const createCreatorSupportTicketActionAdapter = createClientSupportTicketAction;

function TicketList({ tickets, onSelect }: { tickets: SupportTicketSummary[]; onSelect: (id: string) => void }) {
  if (tickets.length === 0) {
    return <p className="text-sm text-ink-muted">No tickets yet for this project.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <button
            type="button"
            onClick={() => onSelect(ticket.id)}
            className="flex w-full flex-col gap-0.5 rounded-md border border-line px-3 py-2 text-left hover:bg-slate-50"
          >
            <span className="text-sm font-semibold text-ink">{ticket.subject}</span>
            <span className="text-xs text-ink-muted">
              {ticket.ticketNumber} · {supportTicketStatusLabel(ticket.status)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Minimal client-facing support/dispute entry point (Phase 7.5) — see
 * SUPPORT_AND_DISPUTE_ARCHITECTURE.md. Every ticket/message created here
 * is scoped server-side to the workspace this review token belongs to
 * (see createClientSupportTicket/addClientSupportMessage) — this
 * component only ever shows the `tickets` list the server already scoped,
 * never fetches anything itself.
 */
export function ClientSupportModal({ token, tickets, reviewerName }: ClientSupportModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"list" | "new">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setView(tickets.length > 0 ? "list" : "new");
          dialogRef.current?.showModal();
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white"
      >
        <LifeBuoy size={14} aria-hidden="true" /> Support
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Support"
        className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/50"
      >
        <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Support</h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {view === "list" && !selected && (
            <>
              <TicketList tickets={tickets} onSelect={(id) => setSelectedId(id)} />
              <button type="button" onClick={() => setView("new")} className="text-sm font-semibold text-vault-blue hover:underline">
                + Raise a new ticket
              </button>
            </>
          )}

          {view === "new" && (
            <CreateTicketForm
              token={token}
              reviewerName={reviewerName}
              onCreated={() => {
                setView("list");
              }}
            />
          )}

          {selected && (
            <TicketDetailView token={token} ticketId={selected.id} reviewerName={reviewerName} onBack={() => setSelectedId(null)} />
          )}
        </div>
      </dialog>
    </>
  );
}

function TicketDetailView({
  token,
  ticketId,
  reviewerName,
  onBack,
}: {
  token: string;
  ticketId: string;
  reviewerName: string;
  onBack: () => void;
}) {
  const [state, action, pending] = useActionState(addClientSupportMessageAction, MESSAGE_INITIAL);

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="text-left text-xs font-semibold text-vault-blue hover:underline">
        &larr; Back to tickets
      </button>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="ticketId" value={ticketId} />
        <input type="hidden" name="reviewerName" value={reviewerName || "Reviewer"} />
        <textarea name="body" rows={3} maxLength={4000} required placeholder="Add a reply…" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send Reply"}
        </button>
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
        {state.success && <p className="text-xs text-success">{state.success}</p>}
      </form>
    </div>
  );
}
