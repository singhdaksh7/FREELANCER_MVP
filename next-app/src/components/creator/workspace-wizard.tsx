"use client";

import { useActionState, useId, useState } from "react";
import { Check, FileText, Shield, CreditCard, ClipboardList, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format-currency";
import { createWorkspaceAction, type WorkspaceFormState } from "@/actions/workspaces";
import type { ClientOption } from "@/data-access/clients";

export interface WorkspaceWizardProps {
  clientOptions: ClientOption[];
}

const STEPS = [
  { id: 1, label: "Project Details", icon: FileText },
  { id: 2, label: "Deliverables", icon: Upload },
  { id: 3, label: "Protection", icon: Shield },
  { id: 4, label: "Payment", icon: CreditCard },
  { id: 5, label: "Review & Create", icon: ClipboardList },
] as const;

const FIELD_STEP: Record<string, number> = {
  title: 1,
  clientId: 1,
  description: 1,
  watermarkText: 3,
  currency: 4,
  amount: 4,
  dueDate: 1,
};

const initialState: WorkspaceFormState = {};

/**
 * Five-step Create Workspace wizard (approved design). Persists only the
 * project/client/protection metadata and payment terms the current schema
 * supports — see MUTATION_ARCHITECTURE.md. File upload is visibly present
 * on step 2 but explicitly labelled as a Phase 5 capability; no browser
 * File objects or base64 payloads are stored, and creating the workspace
 * here always produces a DRAFT with no files attached.
 */
export function WorkspaceWizard({ clientOptions }: WorkspaceWizardProps) {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, initialState);
  const [step, setStep] = useState(1);

  // `fields` is the single source of truth for what's currently typed —
  // it's what gets submitted, so it never needs to be re-synced from the
  // server response (that response is just an echo of what was sent).
  const [fields, setFields] = useState(() => ({
    title: "",
    clientId: clientOptions[0]?.id ?? "",
    description: "",
    dueDate: "",
    watermarkText: "",
    currency: "INR",
    amount: "",
  }));

  // "Adjusting state during render" (see react.dev) instead of an effect:
  // jump back to the earliest step with a validation error whenever the
  // action returns a *new* fieldErrors object.
  const [lastHandledFieldErrors, setLastHandledFieldErrors] = useState(state.fieldErrors);
  if (state.fieldErrors !== lastHandledFieldErrors) {
    setLastHandledFieldErrors(state.fieldErrors);
    if (state.fieldErrors) {
      const erroredSteps = Object.keys(state.fieldErrors).map((field) => FIELD_STEP[field] ?? 1);
      if (erroredSteps.length > 0) setStep(Math.min(...erroredSteps));
    }
  }

  const titleId = useId();
  const clientId = useId();
  const descriptionId = useId();
  const dueDateId = useId();
  const watermarkId = useId();
  const amountId = useId();
  const errorId = useId();

  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) =>
    setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const step1Valid = fields.title.trim().length > 0 && fields.clientId.length > 0;
  const selectedClient = clientOptions.find((c) => c.id === fields.clientId);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted">
        {STEPS.map((s, index) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] ${
                step === s.id
                  ? "border-vault-blue bg-vault-blue text-white"
                  : step > s.id
                    ? "border-vault-blue text-vault-blue"
                    : "border-line text-ink-muted"
              }`}
            >
              {step > s.id ? <Check size={14} aria-hidden="true" /> : s.id}
            </span>
            <span className={step === s.id ? "text-ink" : undefined}>{s.label}</span>
            {index < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      <form action={formAction} noValidate className="flex flex-col gap-5 rounded-lg border border-line bg-surface-card p-6">
        <input type="hidden" name="title" value={fields.title} />
        <input type="hidden" name="clientId" value={fields.clientId} />
        <input type="hidden" name="description" value={fields.description} />
        <input type="hidden" name="dueDate" value={fields.dueDate} />
        <input type="hidden" name="watermarkText" value={fields.watermarkText} />
        <input type="hidden" name="currency" value={fields.currency} />
        <input type="hidden" name="amount" value={fields.amount} />

        {state.error && (
          <p id={errorId} role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
            {state.error}
          </p>
        )}

        {step === 1 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-1 text-base font-bold text-ink">Project Details</legend>
            <div>
              <label htmlFor={titleId} className="mb-1.5 block text-sm font-semibold text-ink">
                Title <span aria-hidden="true">*</span>
              </label>
              <input
                id={titleId}
                value={fields.title}
                onChange={set("title")}
                maxLength={150}
                required
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
              {state.fieldErrors?.title && (
                <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.title[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor={clientId} className="mb-1.5 block text-sm font-semibold text-ink">
                Client <span aria-hidden="true">*</span>
              </label>
              {clientOptions.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  You have no clients yet. <a href="/clients/new" className="font-semibold text-vault-blue">Add a client</a> before creating a workspace.
                </p>
              ) : (
                <select
                  id={clientId}
                  value={fields.clientId}
                  onChange={set("clientId")}
                  required
                  className="w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                >
                  {clientOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
              {state.fieldErrors?.clientId && (
                <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.clientId[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-semibold text-ink">
                Description
              </label>
              <textarea
                id={descriptionId}
                value={fields.description}
                onChange={set("description")}
                rows={4}
                maxLength={2000}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
            </div>

            <div>
              <label htmlFor={dueDateId} className="mb-1.5 block text-sm font-semibold text-ink">
                Due Date
              </label>
              <input
                id={dueDateId}
                type="date"
                value={fields.dueDate}
                onChange={set("dueDate")}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue sm:w-60"
              />
              {state.fieldErrors?.dueDate && (
                <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.dueDate[0]}</p>
              )}
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-bold text-ink">Deliverables</legend>
            <div className="rounded-md border border-dashed border-line bg-slate-50 p-6 text-center">
              <Upload size={28} className="mx-auto mb-2 text-ink-muted" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">Secure file upload is coming in Phase 5</p>
              <p className="mt-1 text-xs text-ink-muted">
                You can create this workspace as a draft now and add deliverables once uploads are available — no
                files, previews, or placeholders are stored today.
              </p>
            </div>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-1 text-base font-bold text-ink">Protection</legend>
            <div>
              <label htmlFor={watermarkId} className="mb-1.5 block text-sm font-semibold text-ink">
                Watermark Text
              </label>
              <input
                id={watermarkId}
                value={fields.watermarkText}
                onChange={set("watermarkText")}
                maxLength={200}
                placeholder="e.g. PREVIEW — Project Vault"
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
              {state.fieldErrors?.watermarkText && (
                <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.watermarkText[0]}</p>
              )}
              <p className="mt-1.5 text-xs text-ink-muted">
                Saved as project metadata now; watermark rendering on previews is a Phase 5 capability.
              </p>
            </div>
          </fieldset>
        )}

        {step === 4 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-1 text-base font-bold text-ink">Payment</legend>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Currency</label>
                <input
                  value={fields.currency}
                  disabled
                  className="w-full rounded-md border border-line bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted"
                />
              </div>
              <div>
                <label htmlFor={amountId} className="mb-1.5 block text-sm font-semibold text-ink">
                  Amount <span aria-hidden="true">*</span>
                </label>
                <input
                  id={amountId}
                  inputMode="decimal"
                  value={fields.amount}
                  onChange={set("amount")}
                  placeholder="25000"
                  required
                  className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                />
                {state.fieldErrors?.amount && (
                  <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.amount[0]}</p>
                )}
              </div>
            </div>
          </fieldset>
        )}

        {step === 5 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-bold text-ink">Review &amp; Create</legend>
            <dl className="grid grid-cols-1 gap-y-2 rounded-md border border-line p-4 text-sm sm:grid-cols-2">
              <dt className="text-ink-muted">Title</dt>
              <dd className="text-right font-medium text-ink sm:text-right">{fields.title || "—"}</dd>
              <dt className="text-ink-muted">Client</dt>
              <dd className="text-right font-medium text-ink">{selectedClient?.name ?? "—"}</dd>
              <dt className="text-ink-muted">Due Date</dt>
              <dd className="text-right font-medium text-ink">{fields.dueDate || "Not set"}</dd>
              <dt className="text-ink-muted">Watermark Text</dt>
              <dd className="text-right font-medium text-ink">{fields.watermarkText || "Not set"}</dd>
              <dt className="text-ink-muted">Amount</dt>
              <dd className="text-right font-semibold text-ink">
                {fields.amount ? formatINR(Number(fields.amount)) : "—"}
              </dd>
            </dl>
            <p className="text-xs text-ink-muted">
              This creates the workspace as a <strong>Draft</strong>. Deliverables can be added once file upload
              ships in Phase 5.
            </p>
          </fieldset>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            disabled={step === 1 || pending}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>

          {step < 5 ? (
            <Button
              type="button"
              disabled={step === 1 && !step1Valid}
              onClick={() => setStep((s) => Math.min(5, s + 1))}
            >
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={pending || clientOptions.length === 0}>
              {pending ? "Creating…" : "Create Draft Workspace"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
