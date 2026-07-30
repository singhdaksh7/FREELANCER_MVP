"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus } from "lucide-react";
import { createInlineClientAction, type InlineClientFormState } from "@/actions/clients";

export interface InlineClientModalProps {
  /** Called once the client is created — id/name only, safe to add straight to a selector. */
  onCreated: (client: { id: string; name: string }) => void;
}

const INITIAL_STATE: InlineClientFormState = {};

/**
 * "Add New Client" modal used inside the workspace wizard's Client field
 * (Phase 7.5) — same clientSchema validation and createClient() mutation
 * layer as the standalone /clients/new form, just without leaving the
 * wizard. Never persists the in-progress client fields anywhere but this
 * form's own DOM state — nothing is written until the creator explicitly
 * submits, and closing the dialog without submitting discards it.
 */
export function InlineClientModal({ onCreated }: InlineClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(createInlineClientAction, INITIAL_STATE);
  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const companyId = useId();
  const phoneId = useId();

  // The wizard that hosts this modal is itself one big <form> (see
  // WorkspaceWizard) — a <form> nested inside another <form> is invalid
  // HTML, and browsers resolve the inner submit against the *outer*
  // form's action instead of this one (silently 404ing, since the outer
  // action doesn't accept this modal's fields). Portaling the dialog to
  // <body> keeps the trigger button inline in Step 1 while rendering the
  // dialog's own <form> completely outside the wizard form's DOM subtree.
  // Starts null to match server-rendered output exactly (no `document` on
  // the server); setting it post-mount is the standard safe pattern for a
  // client-only portal target, not a synchronization loop, despite the
  // general rule against setState-in-effect.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only portal-target mount, not a sync loop
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (state.client) {
      dialogRef.current?.close();
      onCreated(state.client);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  const dialog = (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/50"
    >
      <form action={formAction} noValidate className="flex flex-col gap-4 p-6">
          <h2 id={titleId} className="text-base font-bold text-ink">
            Add New Client
          </h2>

          {state.error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
              {state.error}
            </p>
          )}

          <div>
            <label htmlFor={nameId} className="mb-1.5 block text-sm font-semibold text-ink">
              Client name <span aria-hidden="true">*</span>
            </label>
            <input
              id={nameId}
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={state.values?.name}
              className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
            {state.fieldErrors?.name && <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.name[0]}</p>}
          </div>

          <div>
            <label htmlFor={emailId} className="mb-1.5 block text-sm font-semibold text-ink">
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              required
              maxLength={254}
              defaultValue={state.values?.email}
              className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
            {state.fieldErrors?.email && <p className="mt-1 text-xs font-medium text-danger">{state.fieldErrors.email[0]}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={companyId} className="mb-1.5 block text-sm font-semibold text-ink">
                Company
              </label>
              <input
                id={companyId}
                name="company"
                type="text"
                maxLength={120}
                defaultValue={state.values?.company}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
            </div>
            <div>
              <label htmlFor={phoneId} className="mb-1.5 block text-sm font-semibold text-ink">
                Phone
              </label>
              <input
                id={phoneId}
                name="phone"
                type="tel"
                maxLength={30}
                defaultValue={state.values?.phone}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add Client"}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-vault-blue hover:underline"
      >
        <UserPlus size={14} aria-hidden="true" /> Add New Client
      </button>
      {portalTarget && createPortal(dialog, portalTarget)}
    </>
  );
}
