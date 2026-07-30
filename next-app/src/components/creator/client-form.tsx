"use client";

import { useActionState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClientAction, updateClientAction, type ClientFormState } from "@/actions/clients";

export interface ClientFormProps {
  mode: "create" | "edit";
  clientId?: string;
  initialValues?: { name: string; email: string; company: string; phone: string; notes: string };
}

const EMPTY_VALUES = { name: "", email: "", company: "", phone: "", notes: "" };
const initialState: ClientFormState = {};

/** Shared Create/Edit client form. Validation errors preserve entered values; submit disables while pending to prevent double submission. */
export function ClientForm({ mode, clientId, initialValues = EMPTY_VALUES }: ClientFormProps) {
  const action = mode === "create" ? createClientAction : updateClientAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();

  const values = state.values ?? initialValues;
  const nameId = useId();
  const emailId = useId();
  const companyId = useId();
  const phoneId = useId();
  const notesId = useId();
  const errorId = useId();

  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-col gap-5">
      {clientId && <input type="hidden" name="clientId" value={clientId} />}

      {state.error && (
        <p id={errorId} role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor={nameId} className="mb-1.5 block text-sm font-semibold text-ink">
          Name <span aria-hidden="true">*</span>
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={values.name}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={state.fieldErrors?.name ? `${nameId}-error` : undefined}
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
        {state.fieldErrors?.name && (
          <p id={`${nameId}-error`} className="mt-1 text-xs font-medium text-danger">
            {state.fieldErrors.name[0]}
          </p>
        )}
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
          defaultValue={values.email}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
        {state.fieldErrors?.email && (
          <p id={`${emailId}-error`} className="mt-1 text-xs font-medium text-danger">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={companyId} className="mb-1.5 block text-sm font-semibold text-ink">
            Company
          </label>
          <input
            id={companyId}
            name="company"
            type="text"
            maxLength={120}
            defaultValue={values.company}
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
            defaultValue={values.phone}
            className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
          />
        </div>
      </div>

      <div>
        <label htmlFor={notesId} className="mb-1.5 block text-sm font-semibold text-ink">
          Notes
        </label>
        <textarea
          id={notesId}
          name="notes"
          rows={4}
          maxLength={2000}
          defaultValue={values.notes}
          className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Add Client" : "Save Changes"}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/clients")}
          disabled={pending}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
