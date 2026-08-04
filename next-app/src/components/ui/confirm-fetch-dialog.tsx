"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "./button";

export interface ConfirmFetchResult {
  error?: string;
}

export interface ConfirmFetchDialogProps {
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  /** Performs the mutation via an authenticated same-origin fetch and resolves with `{ error }` on failure or `{}` on success — never throws for an expected failure. */
  onConfirm: () => Promise<ConfirmFetchResult>;
  /** Fires once, only after `onConfirm` resolves with no error. */
  onSuccess?: () => void;
  /** Fires whenever this dialog's own submission is pending vs. settled — lets a parent pause its own polling while a mutation is in flight. */
  onPendingChange?: (pending: boolean) => void;
  destructive?: boolean;
}

/**
 * PHASE 7 Route Handler fallback counterpart to ConfirmDialog
 * (src/components/ui/confirm-dialog.tsx). Same native `<dialog>` UI, but
 * drives the mutation through an explicit `fetch()` + `useTransition`
 * (Part 8 pattern) instead of `useActionState` bound to a Server Action —
 * the confirmed defect is that a Server Action can complete correctly
 * server-side while the browser never applies its returned RSC payload,
 * leaving `pending` stuck true. Resolving a plain fetch Promise in the
 * browser doesn't depend on an RSC merge at all: `pending` deterministically
 * clears in the transition's `finally`, regardless of whether the
 * subsequent `router.refresh()` (issued by the caller inside `onConfirm`)
 * ever lands.
 */
export function ConfirmFetchDialog({
  triggerLabel,
  triggerClassName,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onConfirm,
  onSuccess,
  onPendingChange,
  destructive = false,
}: ConfirmFetchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Belt-and-suspenders against a rapid double-click landing in the same
  // tick before `pending` re-renders the disabled button.
  const submittingRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire when pending itself changes
  }, [pending]);

  function handleConfirm() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        const result = await onConfirm();
        if (result.error) {
          setError(result.error);
          return;
        }
        setError(null);
        dialogRef.current?.close();
        onSuccess?.();
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/95"
      >
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h2 id={titleId} className="text-base font-bold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
              {error}
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
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className={destructive ? "!bg-danger hover:!bg-danger/90" : undefined}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
