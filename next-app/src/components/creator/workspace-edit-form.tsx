"use client";

import { useActionState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateWorkspaceAction, type WorkspaceFormState } from "@/actions/workspaces";
import type { WorkspaceEditDetail } from "@/data-access/workspaces";

export interface WorkspaceEditFormProps {
  workspace: WorkspaceEditDetail;
}

const initialState: WorkspaceFormState = {};

/**
 * Single-page workspace edit form. `clientName` is a plain workspace-scoped
 * text field — editing it never creates or looks up a Client row. It (like
 * amount/currency) is locked once the workspace has reached a
 * paid/delivered status; amount/currency lock earlier, from APPROVED
 * onward, since that's when WorkspaceApproval freezes the amount a
 * payment order will be created from.
 */
export function WorkspaceEditForm({ workspace }: WorkspaceEditFormProps) {
  const [state, formAction, pending] = useActionState(updateWorkspaceAction, initialState);
  const router = useRouter();
  const locked = workspace.financiallyLocked;
  const amountLocked = workspace.amountLocked;

  const values = state.values ?? {
    title: workspace.title,
    clientName: workspace.clientName,
    description: workspace.description ?? "",
    dueDate: workspace.dueDate ?? "",
    watermarkText: workspace.watermarkText ?? "",
    currency: workspace.currency,
    amount: workspace.amount === null ? "" : String(workspace.amount),
  };

  const titleId = useId();
  const clientNameId = useId();
  const descriptionId = useId();
  const dueDateId = useId();
  const watermarkId = useId();
  const amountId = useId();

  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="workspaceId" value={workspace.id} />
      {amountLocked && <input type="hidden" name="currency" value={workspace.currency} />}
      {amountLocked && <input type="hidden" name="amount" value={workspace.amount === null ? "" : String(workspace.amount)} />}
      {locked && <input type="hidden" name="clientName" value={workspace.clientName} />}

      {state.error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      {locked ? (
        <p className="rounded-md bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted">
          This workspace has been paid, so its client, amount, and currency can no longer be changed. You can still
          edit the title, description, due date, and watermark text.
        </p>
      ) : (
        amountLocked && (
          <p className="rounded-md bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted">
            This workspace has been approved, so its amount and currency can no longer be changed. You can still
            edit the title, description, client, due date, and watermark text.
          </p>
        )
      )}

      <div>
        <label htmlFor={titleId} className="mb-1.5 block text-sm font-semibold text-ink">
          Title <span aria-hidden="true">*</span>
        </label>
        <input
          id={titleId}
          name="title"
          defaultValue={values.title}
          maxLength={150}
          required
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
        {state.fieldErrors?.title && (
          <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.title[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor={clientNameId} className="mb-1.5 block text-sm font-semibold text-ink">
          Client Name <span aria-hidden="true">*</span>
        </label>
        <input
          id={clientNameId}
          name="clientName"
          defaultValue={values.clientName}
          disabled={locked}
          maxLength={200}
          required
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue disabled:bg-slate-50 disabled:text-ink-muted"
        />
        {state.fieldErrors?.clientName && (
          <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.clientName[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-semibold text-ink">
          Description
        </label>
        <textarea
          id={descriptionId}
          name="description"
          defaultValue={values.description}
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Currency</label>
          {amountLocked ? (
            <input disabled value={workspace.currency} className="w-full rounded-md border border-line bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted" />
          ) : (
            <input name="currency" defaultValue={values.currency} disabled className="w-full rounded-md border border-line bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted" />
          )}
        </div>
        <div>
          <label htmlFor={amountId} className="mb-1.5 block text-sm font-semibold text-ink">
            Amount <span aria-hidden="true">*</span>
          </label>
          {amountLocked ? (
            <input disabled value={workspace.amount ?? ""} className="w-full rounded-md border border-line bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted" />
          ) : (
            <input
              id={amountId}
              name="amount"
              inputMode="decimal"
              defaultValue={values.amount}
              required
              className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
          )}
          {state.fieldErrors?.amount && (
            <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.amount[0]}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={dueDateId} className="mb-1.5 block text-sm font-semibold text-ink">
          Due Date
        </label>
        <input
          id={dueDateId}
          name="dueDate"
          type="date"
          defaultValue={values.dueDate}
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue sm:w-60"
        />
        {state.fieldErrors?.dueDate && (
          <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.dueDate[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor={watermarkId} className="mb-1.5 block text-sm font-semibold text-ink">
          Watermark Text
        </label>
        <input
          id={watermarkId}
          name="watermarkText"
          defaultValue={values.watermarkText}
          maxLength={200}
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <button
          type="button"
          onClick={() => router.push(`/workspaces/${workspace.id}`)}
          disabled={pending}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
