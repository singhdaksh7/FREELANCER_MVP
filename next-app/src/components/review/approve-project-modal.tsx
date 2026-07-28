"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { approveWorkspaceAction, type ApproveActionState } from "@/actions/review";
import { formatINR } from "@/lib/format-currency";
import type { ReviewableFile } from "@/data-access/review-files";

const INITIAL_STATE: ApproveActionState = {};

export interface ApproveProjectModalProps {
  token: string;
  amount: number;
  files: ReviewableFile[];
  reviewerName: string;
  onApproved: () => void;
}

export function ApproveProjectModal({ token, amount, files, reviewerName, onApproved }: ApproveProjectModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(approveWorkspaceAction, INITIAL_STATE);
  const [name, setName] = useState(reviewerName);
  const titleId = useId();

  useEffect(() => {
    if (state.approved) {
      dialogRef.current?.close();
      onApproved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center justify-center rounded-md bg-success px-4 py-2.5 text-sm font-semibold text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        Approve Project
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/95"
      >
        <form action={action} className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="userAgent" value={typeof navigator !== "undefined" ? navigator.userAgent : ""} />
          <div>
            <h2 id={titleId} className="text-base font-bold text-ink">
              Approve this project?
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              You&apos;re approving the following files and versions exactly as submitted.
            </p>
          </div>

          <ul className="rounded-md border border-line text-sm">
            {files.map((file) => {
              const current = file.versions[file.versions.length - 1];
              return (
                <li key={file.id} className="flex items-center justify-between border-b border-line px-3 py-2 last:border-b-0">
                  <span className="text-ink">{file.displayName}</span>
                  <span className="text-xs text-ink-muted">v{current?.versionNumber ?? "—"}</span>
                </li>
              );
            })}
          </ul>

          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Amount due</span>
              <span className="font-semibold text-ink">{formatINR(amount)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Original files remain securely locked until payment is completed. Payment isn&apos;t available yet in
              this environment.
            </p>
          </div>

          <div>
            <label htmlFor="approve-name" className="text-xs font-semibold text-ink-muted">
              Your name
            </label>
            <input
              id="approve-name"
              name="reviewerName"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="approve-email" className="text-xs font-semibold text-ink-muted">
              Email (optional)
            </label>
            <input
              id="approve-email"
              name="reviewerEmail"
              type="email"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-ink-muted">
            <input type="checkbox" name="termsAccepted" required className="mt-0.5" />
            I confirm the above files and versions are approved as final for this stage. I understand originals
            remain locked until payment.
          </label>

          {state.error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-success px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Approving…" : "Approve Project"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
