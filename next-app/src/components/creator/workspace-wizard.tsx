"use client";

import { useActionState, useEffect, useId, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, ClipboardList } from "lucide-react";
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
  { id: 1, label: "Details & Files", icon: FileText },
  { id: 2, label: "Confirm", icon: ClipboardList },
] as const;

type DeliveryMode = "PAYMENT_REQUIRED" | "APPROVAL_ONLY";

const DELIVERY_MODE_OPTIONS: Array<{ value: DeliveryMode; label: string; description: string }> = [
  {
    value: "PAYMENT_REQUIRED",
    label: "Payment Required",
    description: "Client reviews and approves, completes payment, and receives the files.",
  },
  {
    value: "APPROVAL_ONLY",
    label: "Approval Only",
    description: "Client reviews and approves. You decide when to release the files.",
  },
];

const TRANSIENT_STATUSES = new Set(["UPLOAD_PENDING", "UPLOADING", "UPLOADED", "PROCESSING"]);
const POLL_FAST_INTERVAL_MS = 1000;
const POLL_FAST_WINDOW_MS = 15_000;
const POLL_SLOW_INTERVAL_MS = 2500;

const initialDraftState: CreateDraftState = {};
const initialFinalizeState: FinalizeDraftState = {};

export interface WorkspaceWizardProps {
  draft: WizardDraftDetail | null;
  files: WorkspaceFileListItem[];
  uploadLimits: UploadLimits;
  initialStep: number;
}

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
  const [step, setStep] = useState(initialStep > 2 ? 2 : initialStep);
  const [draftId, setDraftId] = useState<string | undefined>(draft?.id);

  const [draftState, draftFormAction, draftPending] = useActionState(createWorkspaceDraftAction, initialDraftState);
  const [backgroundDraftPending, setBackgroundDraftPending] = useState(false);

  const [finalizeState, finalizeFormAction, finalizePending] = useActionState(
    finalizeWorkspaceDraftAction,
    initialFinalizeState,
  );

  const [fields, setFields] = useState(() => ({
    title: draft?.title ?? "",
    clientName: draft?.clientName ?? "",
    description: draft?.description ?? "",
    dueDate: draft?.dueDate ?? "",
    deliveryMode: (draft?.deliveryMode === "APPROVAL_ONLY" ? "APPROVAL_ONLY" : "PAYMENT_REQUIRED") as DeliveryMode,
    currency: "INR",
    amount: draft?.amount ? String(draft.amount) : "25000",
  }));

  const [lastHandledDraftId, setLastHandledDraftId] = useState(draftState.workspaceId);
  const [lastDraftError, setLastDraftError] = useState(draftState.error);
  const [lastFieldErrors, setLastFieldErrors] = useState(draftState.fieldErrors);

  if (draftState.workspaceId !== lastHandledDraftId) {
    setLastHandledDraftId(draftState.workspaceId);
    setBackgroundDraftPending(false);
    if (draftState.workspaceId && draftState.workspaceId !== draftId) {
      setDraftId(draftState.workspaceId);
      goToStep(1, draftState.workspaceId);
    }
  }

  if (draftState.error !== lastDraftError) {
    setLastDraftError(draftState.error);
    setBackgroundDraftPending(false);
  }

  if (draftState.fieldErrors !== lastFieldErrors) {
    setLastFieldErrors(draftState.fieldErrors);
    setBackgroundDraftPending(false);
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
  const amountId = useId();

  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) =>
    setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const step1Valid =
    fields.title.trim().length > 0 &&
    fields.clientName.trim().length > 0 &&
    (fields.deliveryMode === "APPROVAL_ONLY" || fields.amount.trim().length > 0);

  async function handleDropzoneInteractionWithBuffer(): Promise<boolean> {
    if (draftId) return true;
    if (!step1Valid) return false;

    // Trigger creation
    if (!draftPending && !backgroundDraftPending && !draftState.workspaceId) {
      setBackgroundDraftPending(true);
      const formEl = document.querySelector('form') as HTMLFormElement;
      const formData = formEl ? new FormData(formEl) : new FormData();

      // Fallback to fields if not found in DOM
      if (!formData.has("title")) formData.set("title", fields.title);
      if (!formData.has("clientName")) formData.set("clientName", fields.clientName);
      if (!formData.has("deliveryMode")) formData.set("deliveryMode", fields.deliveryMode);
      if (!formData.has("currency")) formData.set("currency", fields.currency);
      if (!formData.has("amount") && fields.amount) formData.set("amount", fields.amount);
      if (!formData.has("dueDate") && fields.dueDate) formData.set("dueDate", fields.dueDate);

      startTransition(() => {
        draftFormAction(formData);
      });
    }
    return true; // We allow the interaction to proceed so we can buffer files in `onFilesSelected`
  }



  // To properly support auto-creation + immediate upload, we should buffer dropped files if draft is creating
  const [bufferedFiles, setBufferedFiles] = useState<File[] | null>(null);

  const { queue, enqueueFiles, removeItem } = useFileUploadQueue(draftId ?? "", uploadLimits);

  useEffect(() => {
    if (draftId && bufferedFiles) {
      enqueueFiles(bufferedFiles);
      setTimeout(() => setBufferedFiles(null), 0);
    }
  }, [draftId, bufferedFiles, enqueueFiles]);


  const handleFilesSelected = (selectedFiles: File[]) => {
    if (draftId) {
      enqueueFiles(selectedFiles);
    } else {
      setBufferedFiles(selectedFiles);
    }
  };

  const hasTransientFiles = files.some(
    (file) => TRANSIENT_STATUSES.has(file.status) || file.pendingVersion?.status === "PROCESSING",
  );
  const hasUnsyncedUploads = queue.some(
    (item) => item.status === "done" && !files.some((f) => f.displayName === item.name),
  );
  useWizardFilePolling(hasTransientFiles || hasUnsyncedUploads);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
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

        {/* STEP 1: DETAILS & FILES */}
        {step === 1 && (
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
            <form
              action={draftFormAction}
              className="flex flex-1 flex-col gap-5 min-w-0"
            >
              <fieldset className="flex flex-col gap-5">
                <legend className="mb-1 text-lg font-bold text-primary-text">Project Details</legend>
                <div>
                  <label htmlFor={titleId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                    Workspace Title <span aria-hidden="true" className="text-danger">*</span>
                  </label>
                  <input
                    id={titleId}
                    name="title"
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
                    name="clientName"
                    value={fields.clientName}
                    onChange={set("clientName")}
                    placeholder="e.g. Rohit Sharma (DesignTech)"
                    maxLength={200}
                    required
                    className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue"
                  />
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
                    name="description"
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
                    name="dueDate"
                    type="date"
                    value={fields.dueDate}
                    onChange={set("dueDate")}
                    className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue sm:w-60"
                  />
                </div>

                <div className="pt-2">
                  <h3 className="mb-3 text-sm font-semibold text-primary-text">Delivery Mode</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {DELIVERY_MODE_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-4 transition-colors ${
                          fields.deliveryMode === opt.value
                            ? "border-primary-blue bg-primary-blue/5"
                            : "border-line hover:border-vault-gray"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="deliveryMode"
                            value={opt.value}
                            checked={fields.deliveryMode === opt.value}
                            onChange={() => setFields((prev) => ({ ...prev, deliveryMode: opt.value }))}
                            className="h-4 w-4 text-primary-blue focus:ring-primary-blue"
                          />
                          <span className="font-semibold text-primary-text">{opt.label}</span>
                        </div>
                        <p className="text-xs text-secondary-text">{opt.description}</p>
                      </label>
                    ))}
                  </div>
                </div>

                {fields.deliveryMode === "PAYMENT_REQUIRED" && (
                  <div>
                    <label htmlFor={amountId} className="mb-1.5 block text-sm font-semibold text-primary-text">
                      Amount ({fields.currency}) <span aria-hidden="true" className="text-danger">*</span>
                    </label>
                    <input
                      id={amountId}
                      name="amount"
                      type="number"
                      step="0.01"
                      min="1"
                      value={fields.amount}
                      onChange={set("amount")}
                      placeholder="25000"
                      className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-blue sm:w-60"
                    />
                    <input type="hidden" name="currency" value={fields.currency} />
                  </div>
                )}
              </fieldset>
            </form>

            <div className="flex flex-1 flex-col gap-4 min-w-0">
              <h3 className="text-lg font-bold text-primary-text">Upload Files</h3>

              {!draftId && (draftPending || backgroundDraftPending) ? (
                 <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center border-line bg-slate-50">
                    <p className="text-sm font-semibold text-ink">Preparing your workspace…</p>
                 </div>
              ) : !draftId && !step1Valid ? (
                 <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center border-line bg-slate-50 opacity-50 cursor-not-allowed">
                    <p className="text-sm font-semibold text-ink">Preparing upload…</p>
                    <p className="text-xs text-ink-muted">Fill project details first</p>
                 </div>
              ) : (
                <UploadDropzone
                  onInteraction={handleDropzoneInteractionWithBuffer}
                  onFilesSelected={handleFilesSelected}
                  acceptHint={`PDF, ZIP, FIGMA, AI, PSD, PNG up to ${formatBytes(uploadLimits.maxFileSizeBytes)}.`}
                />
              )}

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
                      <FileCard key={file.id} file={file} workspaceId={draftId!} deliveryMode={fields.deliveryMode} />
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-end gap-3 sticky bottom-4 z-10 md:static md:bottom-auto">
                  <Button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="w-full md:w-auto"
                    disabled={!draftId || queue.length === 0 && files.length === 0 || hasTransientFiles || hasUnsyncedUploads || queue.some(i => i.status === "error")}
                  >
                    Continue to Confirmation
                  </Button>
                </div>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIRM */}
        {step === 2 && draftId && (
          <form action={finalizeFormAction} className="flex flex-col gap-6">
            <input type="hidden" name="workspaceId" value={draftId} />
            <input type="hidden" name="title" value={fields.title} />
            <input type="hidden" name="clientName" value={fields.clientName} />
            <input type="hidden" name="description" value={fields.description} />
            <input type="hidden" name="dueDate" value={fields.dueDate} />
            <input type="hidden" name="deliveryMode" value={fields.deliveryMode} />
            <input type="hidden" name="currency" value={fields.currency} />
            {fields.deliveryMode === "PAYMENT_REQUIRED" && (
              <input type="hidden" name="amount" value={fields.amount} />
            )}

            <fieldset className="flex flex-col gap-5">
              <legend className="text-lg font-bold text-primary-text">Step 2: Confirm</legend>
              <div className="rounded-lg border border-line bg-app-bg p-5 text-sm">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-secondary-text">Project Details</dt>
                    <dd className="mt-1 font-medium text-primary-text">{fields.title}</dd>
                    <dd className="mt-0.5 text-secondary-text">Client: {fields.clientName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-secondary-text">Files & Protection</dt>
                    <dd className="mt-1 font-medium text-primary-text">{files.length} files attached</dd>
                    <dd className="mt-0.5 text-secondary-text">Watermarked: INLAY PROTECTED PREVIEW</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-secondary-text">Delivery Mode</dt>
                    {fields.deliveryMode === "PAYMENT_REQUIRED" ? (
                      <dd className="mt-1 font-medium text-primary-text">
                        Payment Required: {formatINR(Number(fields.amount))}
                      </dd>
                    ) : (
                      <dd className="mt-1 font-medium text-primary-text">Approval Only</dd>
                    )}
                  </div>
                </dl>
              </div>
            </fieldset>

            <div className="flex flex-col md:flex-row items-center gap-3 pt-6">
              <Button type="button" variant="outline" onClick={() => goToStep(1)} className="w-full md:w-auto">
                Back
              </Button>
              <Button type="submit" disabled={finalizePending} className="w-full md:w-auto md:ml-auto">
                {finalizePending ? "Creating workspace…" : "Confirm & Create Workspace"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
