"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { requestChangesAction, type ReviewClientActionState } from "@/actions/review";

const INITIAL_STATE: ReviewClientActionState = {};

export interface RequestChangesModalProps {
  token: string;
  reviewerName: string;
  /**
   * Called as soon as the request succeeds. The parent (`ReviewPortal`)
   * uses this to show a persistent confirmation banner immediately —
   * necessary because the Server Action's `revalidatePath` refetches
   * `activeChangeRequest` from the server, which can flip this modal's own
   * visibility (via the parent's `canRequestChanges` prop) before its
   * internal success state ever gets a chance to render.
   */
  onSubmitted: () => void;
}

export function RequestChangesModal({ token, reviewerName, onSubmitted }: RequestChangesModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(requestChangesAction, INITIAL_STATE);
  const titleId = useId();

  useEffect(() => {
    if (state.success) {
      onSubmitted();
      dialogRef.current?.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center justify-center rounded-md border border-warning px-4 py-2.5 text-sm font-semibold text-warning hover:bg-warning-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        Request Changes
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/95"
      >
        {state.success ? (
          <div className="flex flex-col gap-4 p-6">
            <div>
              <h2 id={titleId} className="text-base font-bold text-ink">
                Change request submitted
              </h2>
              <p role="status" className="mt-2 text-sm text-ink-muted">
                {state.success} The creator has been notified and will upload a revised version for your review.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-md bg-vault-blue px-4 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4 p-6">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="reviewerName" value={reviewerName || "Reviewer"} />
            <div>
              <h2 id={titleId} className="text-base font-bold text-ink">
                Request Revisions
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Describe the changes you&apos;d like. The creator will be notified and can upload a new version.
              </p>
            </div>

            <div>
              <label htmlFor="rc-summary" className="text-xs font-semibold text-ink-muted">
                What would you like changed?
              </label>
              <textarea
                id="rc-summary"
                name="summary"
                rows={5}
                required
                maxLength={4000}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

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
                className="rounded-md bg-warning px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Submitting…" : "Submit Changes"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
