"use client";

import { useActionState, useEffect, useId, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Shield, CreditCard, ClipboardList, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format-currency";
import { formatBytes } from "@/lib/bytes";
import {
  createWorkspaceDraftAction,
  finalizeWorkspaceDraftAction,
  type CreateDraftState,
  type FinalizeDraftState,
} from "@/actions/workspaces";
import type { WizardDraftDetail } from "@/data-access/workspaces";
import type { WorkspaceFileListItem } from "@/data-access/files";
import type { UploadLimits } from "@/hooks/use-file-upload-queue";
import { useFileUploadQueue } from "@/hooks/use-file-upload-queue";
import { UploadDropzone } from "./upload-dropzone";
import { FileCard } from "./file-card";

const STEPS = [
  { id: 1, label: "Project", icon: FileText },
  { id: 2, label: "Files", icon: Upload },
  { id: 3, label: "Review Protection", icon: Shield },
  { id: 4, label: "Approval & Payment", icon: CreditCard },
  { id: 5, label: "Confirm", icon: ClipboardList },
] as const;

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

const FILE_STATUS_LABELS: Record<string, string> = {
  UPLOAD_PENDING: "Checking",
  UPLOADING: "Uploading",
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
  DELETED: "Deleted",
};

/** A file counts as "at least one file has completed secure upload verification" once it exists server-side at all — UPLOAD_PENDING/UPLOADING never make it into the persisted files list in the first place (see completeUploadSession). */
const TRANSIENT_STATUSES = new Set(["UPLOAD_PENDING", "UPLOADING", "UPLOADED", "PROCESSING"]);
const FIELD_STEP: Record<string, number> = {
  title: 1,
  clientName: 1,
  description: 1,
  dueDate: 1,
  watermarkText: 3,
  deliveryMode: 4,
  currency: 4,
  amount: 4,
};
const POLL_FAST_INTERVAL_MS = 1000;
const POLL_FAST_WINDOW_MS = 15_000;
const POLL_SLOW_INTERVAL_MS = 2500;

const initialDraftState: CreateDraftState = {};
const initialFinalizeState: FinalizeDraftState = {};

export interface WorkspaceWizardProps {
  /** Non-null when `?draft=` resolved to a real, owned, still-DRAFT workspace — see NewWorkspacePage. */
  draft: WizardDraftDetail | null;
  files: WorkspaceFileListItem[];
  uploadLimits: UploadLimits;
  initialStep: number;
}

/**
 * Polls the server for persisted-file status changes while any file is
 * still transient — fast (1s) for the first 15s after upload starts, then
 * slower (2.5s), matching how quickly preview processing typically
 * resolves. A single recursive `setTimeout` chain (not `setInterval`)
 * means there's never more than one refresh in flight, and the effect's
 * cleanup (on `hasTransient` flipping false, or unmount) always cancels
 * the pending timer.
 */
function useWizardFilePolling(hasTransient: boolean): void {
  const router = useRouter();
  const pollStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasTransient) {
      pollStartedAtRef.current = null;
      return;
    }
    if (pollStartedAtRef.current === null) {
      pollStartedAtRef.current = Date.now();
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const elapsed = Date.now() - (pollStartedAtRef.current ?? Date.now());
      const delay = elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_INTERVAL_MS : POLL_SLOW_INTERVAL_MS;
      timer = setTimeout(() => {
        if (cancelled) return;
        startTransition(() => {
          router.refresh();
        });
        scheduleNext();
      }, delay);
    }
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasTransient, router]);
}

export function WorkspaceWizard({ draft, files, uploadLimits, initialStep }: WorkspaceWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [draftId, setDraftId] = useState<string | undefined>(draft?.id);

  const [draftState, draftFormAction, draftPending] = useActionState(createWorkspaceDraftAction, initialDraftState);
  // Belt-and-suspenders against a double-submit racing ahead of React
  // committing the disabled-button state (e.g. two pointerdown events in
  // the same task, or a synthetic/forced click that bypasses the
  // browser's own "don't submit via a disabled button" check) — this ref
  // flips synchronously inside the submit event itself, before any
  // render, so a second submission in the same tick can never reach
  // draftFormAction. Reset once the action settles without producing a
  // workspaceId (a real error), so a genuine retry after failure isn't
  // permanently blocked.
  const hasSubmittedDraftRef = useRef(false);
  useEffect(() => {
    if (!draftPending && !draftState.workspaceId) {
      hasSubmittedDraftRef.current = false;
    }
  }, [draftPending, draftState.workspaceId]);
  const [finalizeState, finalizeFormAction, finalizePending] = useActionState(
    finalizeWorkspaceDraftAction,
    initialFinalizeState,
  );

  const [fields, setFields] = useState(() => ({
    title: draft?.title ?? "",
    clientName: draft?.clientName ?? "",
    description: draft?.description ?? "",
    dueDate: draft?.dueDate ?? "",
    watermarkText: draft?.watermarkText ?? "PREVIEW — PROPERTY OF CREATOR",
    deliveryMode: (draft?.deliveryMode === "APPROVAL_ONLY" ? "APPROVAL_ONLY" : "PAYMENT_REQUIRED") as DeliveryMode,
    currency: "INR",
    amount: draft?.amount ? String(draft.amount) : "25000",
  }));

  // Moves to Step 2 exactly once, the first time createWorkspaceDraftAction
  // hands back a workspaceId — never re-fires for a resumed draft (whose
  // `draftId` is already set from the `draft` prop before this ever runs),
  // which is what keeps a repeated Step 1 "Continue" click from creating a
  // second draft. Handled during render (not an effect) for the same
  // "adjust state from a prop/action-result change" reason the fieldErrors
  // handling below does the same thing.
  const [lastHandledDraftId, setLastHandledDraftId] = useState(draftState.workspaceId);
  if (draftState.workspaceId !== lastHandledDraftId) {
    setLastHandledDraftId(draftState.workspaceId);
    if (draftState.workspaceId && draftState.workspaceId !== draftId) {
      setDraftId(draftState.workspaceId);
      goToStep(2, draftState.workspaceId);
    }
  }

  const [lastHandledFieldErrors, setLastHandledFieldErrors] = useState(finalizeState.fieldErrors);
  if (finalizeState.fieldErrors !== lastHandledFieldErrors) {
    setLastHandledFieldErrors(finalizeState.fieldErrors);
    if (finalizeState.fieldErrors) {
      const erroredSteps = Object.keys(finalizeState.fieldErrors).map((field) => FIELD_STEP[field] ?? 1);
      if (erroredSteps.length > 0) setStep(Math.min(...erroredSteps));
    }
  }

  function goToStep(next: number, idOverride?: string) {
    setStep(next);
    const id = idOverride ?? draftId;
    const params = new URLSearchParams();
    if (id) params.set("draft", id);
    params.set("step", String(next));
    router.replace(`/workspaces/new?${params.toString()}`, { scroll: false });
  }

  const titleId = useId();
  const clientNameId = useId();
  const descriptionId = useId();
  const dueDateId = useId();
  const watermarkId = useId();
  const amountId = useId();

  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) =>
    setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const step1Valid = fields.title.trim().length > 0 && fields.clientName.trim().length > 0;

  const { queue, enqueueFiles, removeItem } = useFileUploadQueue(draftId ?? "", uploadLimits);

  const hasTransientFiles = files.some(
    (file) => TRANSIENT_STATUSES.has(file.status) || file.pendingVersion?.status === "PROCESSING",
  );
  const hasUnsyncedUploads = queue.some(
    (item) => item.status === "done" && !files.some((f) => f.displayName === item.name),
  );
  useWizardFilePolling(hasTransientFiles || hasUnsyncedUploads);

  const hasVerifiedUpload = files.some((f) => f.status !== "DELETED") || queue.some((item) => item.status === "done");

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

      <div className="flex flex-col gap-6 rounded-xl border border-line bg-card p-6 shadow-sm">
        {finalizeState.error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
            {finalizeState.error}
          </p>
        )}
        {draftState.error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
            {draftState.error}
          </p>
        )}

        {/* STEP 1: PROJECT */}
        {step === 1 && (
          <form
            action={draftFormAction}
            onSubmit={(event) => {
              if (hasSubmittedDraftRef.current) {
                event.preventDefault();
                return;
              }
              hasSubmittedDraftRef.current = true;
            }}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="title" value={fields.title} />
            <input type="hidden" name="clientName" value={fields.clientName} />
            <input type="hidden" name="description" value={fields.description} />
            <input type="hidden" name="dueDate" value={fields.dueDate} />

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
                {draftState.fieldErrors?.title && (
                  <p className="mt-1 text-xs font-medium text-danger">{draftState.fieldErrors.title[0]}</p>
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
                {draftState.fieldErrors?.clientName && (
                  <p className="mt-1 text-xs font-medium text-danger">{draftState.fieldErrors.clientName[0]}</p>
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

            <div className="flex items-center justify-between border-t border-line pt-5">
              <span />
              {draftId ? (
                <Button type="button" disabled={!step1Valid} onClick={() => goToStep(2)}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" disabled={!step1Valid || draftPending}>
                  {draftPending ? "Creating…" : "Continue"}
                </Button>
              )}
            </div>
          </form>
        )}

        {/* STEP 2: FILES */}
        {step === 2 && draftId && (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-lg font-bold text-primary-text">Step 2: Upload Files</legend>

            <UploadDropzone
              onFilesSelected={enqueueFiles}
              acceptHint={`PDF, ZIP, FIGMA, AI, PSD, PNG up to ${formatBytes(uploadLimits.maxFileSizeBytes)}. Files can also be added later in the Workspace Files tab.`}
            />

            {queue.length > 0 && (
              <ul className="flex flex-col gap-2">
                {queue.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-primary-text">{item.name}</p>
                      <p className="text-xs text-muted-text">{formatBytes(item.sizeBytes)}</p>
                      {item.status === "error" ? (
                        <p className="text-xs font-medium text-danger">{item.errorMessage}</p>
                      ) : (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-primary-blue transition-all"
                            style={{ width: `${item.status === "done" ? 100 : item.progress}%` }}
                          />
                        </div>
                      )}
                      {item.status === "done" && (
                        <p className="mt-1 text-xs text-success">
                          Uploaded successfully. Protected preview is being prepared.
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-text">
                      {item.status === "validating" && "Checking…"}
                      {item.status === "uploading" && `Uploading ${item.progress}%`}
                      {item.status === "verifying" && "Verifying…"}
                      {item.status === "done" && "Uploaded"}
                      {item.status === "error" && "Failed"}
                    </span>
                    {item.status === "error" && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="shrink-0 text-xs font-semibold text-muted-text hover:text-primary-text"
                      >
                        Dismiss
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {files.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {files.map((file) => (
                  <FileCard key={file.id} file={file} workspaceId={draftId} deliveryMode={fields.deliveryMode} />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line pt-5">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="rounded-md border border-line px-5 py-2.5 text-xs font-bold text-primary-text hover:bg-app-bg"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                {!hasVerifiedUpload && (
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    className="text-xs font-bold text-secondary-text underline hover:text-primary-text"
                  >
                    Add files later
                  </button>
                )}
                <Button type="button" onClick={() => goToStep(3)}>
                  Continue
                </Button>
              </div>
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

            <div className="relative overflow-hidden rounded-xl border border-line bg-primary-navy p-6 text-center text-white">
              <div className="watermark-overlay absolute inset-0 opacity-40" />
              <div className="relative z-10 py-6">
                <span className="text-xs font-mono uppercase tracking-widest text-white/70">
                  {fields.watermarkText || "PREVIEW WATERMARK DEMO"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-5">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="rounded-md border border-line px-5 py-2.5 text-xs font-bold text-primary-text hover:bg-app-bg"
              >
                Back
              </button>
              <Button type="button" onClick={() => goToStep(4)}>
                Continue
              </Button>
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
                  {finalizeState.fieldErrors?.amount && (
                    <p className="mt-1 text-xs font-medium text-danger">{finalizeState.fieldErrors.amount[0]}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line pt-5">
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="rounded-md border border-line px-5 py-2.5 text-xs font-bold text-primary-text hover:bg-app-bg"
              >
                Back
              </button>
              <Button type="button" onClick={() => goToStep(5)}>
                Continue
              </Button>
            </div>
          </fieldset>
        )}

        {/* STEP 5: CONFIRM */}
        {step === 5 && draftId && (
          <form action={finalizeFormAction} className="flex flex-col gap-4">
            <input type="hidden" name="workspaceId" value={draftId} />
            <input type="hidden" name="title" value={fields.title} />
            <input type="hidden" name="clientName" value={fields.clientName} />
            <input type="hidden" name="description" value={fields.description} />
            <input type="hidden" name="dueDate" value={fields.dueDate} />
            <input type="hidden" name="watermarkText" value={fields.watermarkText} />
            <input type="hidden" name="deliveryMode" value={fields.deliveryMode} />
            <input type="hidden" name="currency" value={fields.currency} />
            {/* Never submits a stale/leftover amount for APPROVAL_ONLY — the
                Step 4 amount field is hidden (not cleared) when switching
                away from PAYMENT_REQUIRED so a creator's typed value comes
                back if they switch back, but it must never actually reach
                finalizeWorkspaceDraft while APPROVAL_ONLY is selected: an
                approval-only workspace must store no amount at all. */}
            <input
              type="hidden"
              name="amount"
              value={fields.deliveryMode === "PAYMENT_REQUIRED" ? fields.amount : ""}
            />

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 text-lg font-bold text-primary-text">Step 5: Review & Create Workspace</legend>
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
                  {fields.deliveryMode === "PAYMENT_REQUIRED" && fields.amount
                    ? formatINR(Number(fields.amount))
                    : "Approval Only"}
                </dd>
                <dt className="text-secondary-text">Files</dt>
                <dd className="text-right font-bold text-primary-text">
                  {files.length} uploaded
                </dd>
              </dl>

              {files.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-xl border border-line p-4 text-xs">
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-primary-text">{file.displayName}</span>
                      <span className="shrink-0 font-semibold text-secondary-text">
                        {FILE_STATUS_LABELS[file.status] ?? file.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <div className="flex items-center justify-between border-t border-line pt-5">
              <button
                type="button"
                onClick={() => goToStep(4)}
                disabled={finalizePending}
                className="rounded-md border border-line px-5 py-2.5 text-xs font-bold text-primary-text hover:bg-app-bg disabled:opacity-50"
              >
                Back
              </button>
              <Button type="submit" disabled={finalizePending}>
                {finalizePending ? "Creating…" : "Create Workspace"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
