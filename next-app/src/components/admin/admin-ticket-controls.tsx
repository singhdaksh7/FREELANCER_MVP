"use client";

import { useActionState } from "react";
import {
  addAdminSupportMessageAction,
  updateSupportTicketStatusAction,
  type SupportTicketMessageFormState,
} from "@/actions/support-tickets";
import { supportTicketStatusLabel } from "@/lib/status-labels";

const INITIAL_STATE: SupportTicketMessageFormState = {};
const STATUSES = ["OPEN", "UNDER_REVIEW", "WAITING_FOR_CREATOR", "WAITING_FOR_CLIENT", "RESOLVED", "CLOSED"] as const;

export function AdminTicketReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(addAdminSupportMessageAction, INITIAL_STATE);
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      <textarea
        name="body"
        placeholder="Write a reply…"
        rows={3}
        maxLength={4000}
        required
        className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2 text-sm font-semibold text-white hover:bg-vault-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send Reply"}
        </button>
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
        {state.success && <span className="text-xs text-success">{state.success}</span>}
      </div>
    </form>
  );
}

export function AdminTicketStatusForm({ ticketId, currentStatus }: { ticketId: string; currentStatus: string }) {
  const [state, action, pending] = useActionState(updateSupportTicketStatusAction, INITIAL_STATE);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <select
        name="status"
        defaultValue={currentStatus}
        className="rounded-md border border-line px-3 py-1.5 text-sm"
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {supportTicketStatusLabel(status)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update Status"}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
