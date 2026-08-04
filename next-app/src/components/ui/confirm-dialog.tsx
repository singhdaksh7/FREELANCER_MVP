"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "./button";

export interface ConfirmActionState {
  error?: string;
  success?: string;
}

export interface ConfirmDialogProps {
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  action: (prevState: ConfirmActionState, formData: FormData) => Promise<ConfirmActionState>;
  initialState: ConfirmActionState;
  hiddenFields: Record<string, string>;
  onSuccess?: (state: ConfirmActionState) => void;
  /** Fires whenever this dialog's own submission is pending vs. settled — lets a parent (e.g. FilesTab) pause its own polling while a mutation is in flight, so a concurrent router.refresh() can't clobber this action's own revalidated tree. */
  onPendingChange?: (pending: boolean) => void;
  destructive?: boolean;
}

/**
 * Reusable confirm-then-submit dialog backed by a real Server Action
 * (client delete, workspace cancel, workspace delete all use this). Uses
 * the native `<dialog>` element for built-in focus trapping/Escape-to-close
 * accessibility. The submit button disables while `pending`, so a slow
 * network can't produce a double submission.
 */
export function ConfirmDialog({
  triggerLabel,
  triggerClassName,
  title,
  description,
  confirmLabel,
  pendingLabel,
  action,
  initialState,
  hiddenFields,
  onSuccess,
  onPendingChange,
  destructive = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const titleId = useId();

  useEffect(() => {
    if (state.success) {
      dialogRef.current?.close();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire when the action's result changes
  }, [state]);

  useEffect(() => {
    onPendingChange?.(pending);
    // Also clear on unmount, in case the dialog/card disappears mid-submit.
    return () => onPendingChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire when pending itself changes
  }, [pending]);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={triggerClassName}>
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        // Near-opaque (not translucent) backdrop: a partially-see-through
        // backdrop lets whatever's behind it (a file list of varying
        // length, etc.) bleed into visual-regression screenshots with
        // small, genuinely nondeterministic pixel drift — solid backdrop
        // removes that source of flakiness app-wide, not just for tests.
        className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/95"
      >
        <form action={formAction} className="flex flex-col gap-4 p-6">
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <div>
            <h2 id={titleId} className="text-base font-bold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
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
            <Button
              type="submit"
              disabled={pending}
              className={destructive ? "!bg-danger hover:!bg-danger/90" : undefined}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
