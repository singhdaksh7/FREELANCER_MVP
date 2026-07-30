"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { ArrowRight, Key, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthCard } from "./auth-card";
import { registerAction, type AuthActionState } from "@/actions/auth";

const initialState: AuthActionState = {};

/** Real registration via a Server Action: Zod-validated, hashes the password, prevents duplicate emails, then establishes a session. */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const passwordErrorId = useId();

  return (
    <AuthCard
      heading="Create Freelancer Account"
      subheading="Start delivering payment-gated work to clients"
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-vault-blue">
            Sign In
          </Link>
        </span>
      }
    >
      <form action={formAction} noValidate className="flex flex-col gap-5">
        {state.error && (
          <p
            id={errorId}
            role="alert"
            className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-sm font-semibold text-ink">
            Full Name
          </label>
          <div className="relative">
            <User
              size={18}
              color="#94A3B8"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              id={nameId}
              name="name"
              type="text"
              required
              defaultValue={state.values?.name ?? ""}
              aria-describedby={state.fieldErrors?.name ? `${nameId}-error` : undefined}
              placeholder="Arjun Raj"
              className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
          </div>
          {state.fieldErrors?.name && (
            <p id={`${nameId}-error`} className="mt-1.5 text-xs text-danger">
              {state.fieldErrors.name[0]}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={emailId} className="mb-1.5 block text-sm font-semibold text-ink">
            Email Address
          </label>
          <div className="relative">
            <Mail
              size={18}
              color="#94A3B8"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              id={emailId}
              name="email"
              type="email"
              required
              defaultValue={state.values?.email ?? ""}
              aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
              placeholder="arjun@example.com"
              className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
          </div>
          {state.fieldErrors?.email && (
            <p id={`${emailId}-error`} className="mt-1.5 text-xs text-danger">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={passwordId} className="mb-1.5 block text-sm font-semibold text-ink">
            Password
          </label>
          <div className="relative">
            <Key
              size={18}
              color="#94A3B8"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              id={passwordId}
              name="password"
              type="password"
              required
              aria-describedby={state.fieldErrors?.password ? passwordErrorId : undefined}
              placeholder="At least 8 characters, with a letter and a number"
              className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
          </div>
          {state.fieldErrors?.password && (
            <ul id={passwordErrorId} className="mt-1.5 flex flex-col gap-0.5 text-xs text-danger">
              {state.fieldErrors.password.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>

        <Button type="submit" disabled={pending} className="mt-2.5 w-full py-3 text-[15px]">
          {pending ? "Creating Account…" : "Create Account"}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </form>
    </AuthCard>
  );
}
