"use client";

import { useActionState, useId, useState } from "react";
import { Check, FileText, Shield, CreditCard, ClipboardList, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format-currency";
import { createWorkspaceAction, type WorkspaceFormState } from "@/actions/workspaces";

const STEPS = [
  { id: 1, label: "Project", icon: FileText },
  { id: 2, label: "Files", icon: Upload },
  { id: 3, label: "Review Protection", icon: Shield },
  { id: 4, label: "Approval & Payment", icon: CreditCard },
  { id: 5, label: "Confirm", icon: ClipboardList },
] as const;

const FIELD_STEP: Record<string, number> = {
  title: 1,
  clientName: 1,
  description: 1,
  watermarkText: 3,
  deliveryMode: 4,
  currency: 4,
  amount: 4,
  dueDate: 1,
};

type DeliveryMode = "PAYMENT_REQUIRED" | "APPROVAL_ONLY";

const DELIVERY_MODE_OPTIONS: Array<{ value: DeliveryMode; label: string; description: string }> = [
  {
    value: "PAYMENT_REQUIRED",
    label: "Payment Required",
    description:
      "Your client reviews and approves the work, completes payment, and then receives the approved original files.",
  },
  {
    value: "APPROVAL_ONLY",
    label: "Approval Only",
    description:
      "Your client reviews and approves the work. You decide when to release the original files.",
  },
];

const initialState: WorkspaceFormState = {};

export function WorkspaceWizard() {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, initialState);
  const [step, setStep] = useState(1);

  const [fields, setFields] = useState(() => ({
    title: "",
    clientName: "",
    description: "",
    dueDate: "",
    watermarkText: "PREVIEW — PROPERTY OF CREATOR",
    deliveryMode: "PAYMENT_REQUIRED" as DeliveryMode,
    currency: "INR",
    amount: "25000",
  }));

  const [lastHandledFieldErrors, setLastHandledFieldErrors] = useState(state.fieldErrors);
  if (state.fieldErrors !== lastHandledFieldErrors) {
    setLastHandledFieldErrors(state.fieldErrors);
    if (state.fieldErrors) {
      const erroredSteps = Object.keys(state.fieldErrors).map((field) => FIELD_STEP[field] ?? 1);
      if (erroredSteps.length > 0) setStep(Math.min(...erroredSteps));
    }
  }

  const titleId = useId();
  const clientNameId = useId();
  const descriptionId = useId();
  const dueDateId = useId();
  const watermarkId = useId();
  const amountId = useId();
  const errorId = useId();

  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) =>
    setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const step1Valid = fields.title.trim().length > 0 && fields.clientName.trim().length > 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* 5-Stage Stepper Bar */}
      <ol className="flex flex-wrap items-center gap-2 text-xs font-bold text-secondary-text">
        {STEPS.map((s, index) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                step === s.id
                  ? "border-primary-blue bg-primary-blue text-white"
                  : step > s.id
                    ? "border-success bg-success-bg text-success"
                    : "border-line text-muted-text"
              }`}
            >
              {step > s.id ? <Check size={14} aria-hidden="true" /> : s.id}
            </span>
            <span className={step === s.id ? "text-primary-text font-bold" : undefined}>{s.label}</span>
            {index < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      <form action={formAction} noValidate className="flex flex-col gap-6 rounded-xl border border-line bg-card p-6 shadow-sm">
        <input type="hidden" name="title" value={fields.title} />
        <input type="hidden" name="clientName" value={fields.clientName} />
        <input type="hidden" name="description" value={fields.description} />
        <input type="hidden" name="dueDate" value={fields.dueDate} />
        <input type="hidden" name="watermarkText" value={fields.watermarkText} />
        <input type="hidden" name="deliveryMode" value={fields.deliveryMode} />
        <input type="hidden" name="currency" value={fields.currency} />
        <input type="hidden" name="amount" value={fields.amount} />

        {state.error && (
          <p id={errorId} role="alert" className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
            {state.error}
          </p>
        )}

        {/* STEP 1: PROJECT */}
        {step === 1 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-1 text-lg font-bold text-primary-text">Step 1: Project Details</legend>
            <div>
              <label htmlFor={titleId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                Workspace Title <span aria-hidden="true" className="text-danger">*</span>
              </label>
              <input
                id={titleId}
                value={fields.title}
                onChange={set("title")}
                placeholder="e.g. Brand Identity Design V2"
                maxLength={150}
                required
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue"
              />
              {state.fieldErrors?.title && (
                <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.title[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor={clientNameId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                Client Name <span aria-hidden="true" className="text-danger">*</span>
              </label>
              <input
                id={clientNameId}
                value={fields.clientName}
                onChange={set("clientName")}
                placeholder="e.g. Rohit Sharma (DesignTech)"
                maxLength={200}
                required
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue"
              />
              <p className="mt-1 text-xs text-muted-text">Client name is stored securely for this workspace.</p>
              {state.fieldErrors?.clientName && (
                <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.clientName[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                Description / Scope Notes
              </label>
              <textarea
                id={descriptionId}
                value={fields.description}
                onChange={set("description")}
                placeholder="Deliverable details and scope notes for your client..."
                rows={4}
                maxLength={2000}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue"
              />
            </div>

            <div>
              <label htmlFor={dueDateId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                Due Date
              </label>
              <input
                id={dueDateId}
                type="date"
                value={fields.dueDate}
                onChange={set("dueDate")}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue sm:w-60"
              />
            </div>
          </fieldset>
        )}

        {/* STEP 2: FILES */}
        {step === 2 && (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-lg font-bold text-primary-text">Step 2: Upload Files</legend>
            <div className="rounded-xl border-2 border-dashed border-primary-blue/40 bg-soft-blue/40 p-8 text-center">
              <Upload size={36} className="mx-auto mb-3 text-primary-blue" aria-hidden="true" />
              <p className="text-base font-bold text-primary-text">Drag and drop original files here</p>
              <p className="mt-1 text-xs text-secondary-text">
                Supports PDF, ZIP, FIGMA, AI, PSD, PNG up to 50MB. Files can also be added in the Workspace Files tab.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary-blue px-4 py-2 text-xs font-bold text-white hover:bg-blue-hover"
              >
                Browse Files
              </button>
            </div>
          </fieldset>
        )}

        {/* STEP 3: REVIEW PROTECTION */}
        {step === 3 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-1 text-lg font-bold text-primary-text">Step 3: Review Protection</legend>
            <div>
              <label htmlFor={watermarkId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                Watermark Text Stamp
              </label>
              <input
                id={watermarkId}
                value={fields.watermarkText}
                onChange={set("watermarkText")}
                maxLength={200}
                placeholder="e.g. PREVIEW — PROPERTY OF CREATOR"
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue"
              />
            </div>

            <div className="rounded-xl border border-warning-bg bg-warning-bg/40 p-4 text-xs text-warning">
              <strong>Protected Preview:</strong> Your client reviews protected previews. Original files remain unavailable until the workspace requirements are completed.
            </div>

            {/* Visual Watermark Preview Mockup */}
            <div className="relative overflow-hidden rounded-xl border border-line bg-primary-navy p-6 text-center text-white">
              <div className="watermark-overlay absolute inset-0 opacity-40" />
              <div className="relative z-10 py-6">
                <span className="text-xs font-mono uppercase tracking-widest text-white/70">
                  {fields.watermarkText || "PREVIEW WATERMARK DEMO"}
                </span>
              </div>
            </div>
          </fieldset>
        )}

        {/* STEP 4: APPROVAL & PAYMENT */}
        {step === 4 && (
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-1 text-lg font-bold text-primary-text">Step 4: Approval &amp; Payment</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DELIVERY_MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-5 text-sm transition-colors ${
                    fields.deliveryMode === option.value
                      ? "border-primary-blue bg-soft-blue/30"
                      : "border-line bg-card hover:border-primary-blue/50"
                  }`}
                >
                  <span className="flex items-center gap-2 font-bold text-primary-text">
                    <input
                      type="radio"
                      name="deliveryModeChoice"
                      value={option.value}
                      checked={fields.deliveryMode === option.value}
                      onChange={() => setFields((prev) => ({ ...prev, deliveryMode: option.value }))}
                      className="h-4 w-4 accent-primary-blue"
                    />
                    {option.label}
                  </span>
                  <span className="pl-6 text-xs text-secondary-text leading-relaxed">{option.description}</span>
                </label>
              ))}
            </div>

            {fields.deliveryMode === "PAYMENT_REQUIRED" && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-primary-text">Currency</label>
                  <input
                    value="INR (₹)"
                    disabled
                    className="w-full rounded-md border border-line bg-app-bg px-3.5 py-2.5 text-sm text-secondary-text font-bold"
                  />
                </div>
                <div>
                  <label htmlFor={amountId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                    Amount (₹) <span aria-hidden="true" className="text-danger">*</span>
                  </label>
                  <input
                    id={amountId}
                    inputMode="decimal"
                    value={fields.amount}
                    onChange={set("amount")}
                    placeholder="25000"
                    required
                    className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-blue"
                  />
                  {state.fieldErrors?.amount && (
                    <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.amount[0]}</p>
                  )}
                </div>
              </div>
            )}
          </fieldset>
        )}

        {/* STEP 5: CONFIRM */}
        {step === 5 && (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-lg font-bold text-primary-text">Step 5: Confirm Workspace</legend>
            <dl className="grid grid-cols-1 gap-y-3 rounded-xl border border-line bg-app-bg p-5 text-sm sm:grid-cols-2">
              <dt className="text-secondary-text">Title</dt>
              <dd className="text-right font-bold text-primary-text">{fields.title || "—"}</dd>
              <dt className="text-secondary-text">Client</dt>
              <dd className="text-right font-bold text-primary-text">{fields.clientName || "—"}</dd>
              <dt className="text-secondary-text">Due Date</dt>
              <dd className="text-right font-medium text-primary-text">{fields.dueDate || "Not set"}</dd>
              <dt className="text-secondary-text">Watermark Stamp</dt>
              <dd className="text-right font-medium text-primary-text">{fields.watermarkText || "Not set"}</dd>
              <dt className="text-secondary-text">Delivery Mode</dt>
              <dd className="text-right font-bold text-primary-blue">
                {DELIVERY_MODE_OPTIONS.find((o) => o.value === fields.deliveryMode)?.label}
              </dd>
              <dt className="text-secondary-text">Required Amount</dt>
              <dd className="text-right font-extrabold text-primary-text">
                {fields.amount ? formatINR(Number(fields.amount)) : "Approval Only"}
              </dd>
            </dl>
          </fieldset>
        )}

        {/* Stepper Footer Controls */}
        <div className="flex items-center justify-between border-t border-line pt-5">
          <button
            type="button"
            disabled={step === 1 || pending}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-md border border-line px-5 py-2.5 text-xs font-bold text-primary-text hover:bg-app-bg disabled:opacity-50"
          >
            Back
          </button>

          {step < 5 ? (
            <Button
              key="continue-button"
              type="button"
              disabled={step === 1 && !step1Valid}
              onClick={() => setStep((s) => Math.min(5, s + 1))}
            >
              Continue
            </Button>
          ) : (
            <Button key="submit-button" type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create Workspace"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
