"use client";

import { useActionState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createCreatorSupportTicketAction, type SupportTicketFormState } from "@/actions/support-tickets";
import { SUPPORT_TICKET_CATEGORIES } from "@/validation/support-ticket";
import { supportTicketCategoryLabel } from "@/lib/status-labels";

const INITIAL_STATE: SupportTicketFormState = {};

export function SupportTicketForm({ workspaceId, workspaceTitle }: { workspaceId?: string; workspaceTitle?: string }) {
  const [state, formAction, pending] = useActionState(createCreatorSupportTicketAction, INITIAL_STATE);
  const router = useRouter();
  const categoryId = useId();
  const subjectId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (state.ticketId) router.push(`/support/${state.ticketId}`);
  }, [state.ticketId, router]);

  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-col gap-5">
      {workspaceId && <input type="hidden" name="workspaceId" value={workspaceId} />}

      {state.error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      {workspaceTitle && (
        <p className="rounded-md bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted">
          This ticket will be linked to <span className="font-semibold text-ink">{workspaceTitle}</span>.
        </p>
      )}

      <div>
        <label htmlFor={categoryId} className="mb-1.5 block text-sm font-semibold text-ink">
          Category <span aria-hidden="true">*</span>
        </label>
        <select
          id={categoryId}
          name="category"
          required
          defaultValue=""
          className="w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          <option value="" disabled>
            Select a category
          </option>
          {SUPPORT_TICKET_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {supportTicketCategoryLabel(category)}
            </option>
          ))}
        </select>
        {state.fieldErrors?.category && <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.category[0]}</p>}
      </div>

      <div>
        <label htmlFor={subjectId} className="mb-1.5 block text-sm font-semibold text-ink">
          Subject <span aria-hidden="true">*</span>
        </label>
        <input
          id={subjectId}
          name="subject"
          maxLength={150}
          required
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
        {state.fieldErrors?.subject && <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.subject[0]}</p>}
      </div>

      <div>
        <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-semibold text-ink">
          Description <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={descriptionId}
          name="description"
          rows={6}
          maxLength={4000}
          required
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
        {state.fieldErrors?.description && <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.description[0]}</p>}
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create Ticket"}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/support")}
          disabled={pending}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
