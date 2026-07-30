"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { ArrowRight, Key, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/branding";
import { AuthCard } from "./auth-card";
import { loginAction, type AuthActionState } from "@/actions/auth";

const initialState: AuthActionState = {};

/** Real credentials login via Auth.js (Server Action). Errors are always the same generic message — never reveals whether the email exists. */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  return (
    <AuthCard
      heading={`Sign in to ${BRAND.productName}`}
      subheading="Enter your credentials to access your workspaces"
      footer={
        <span>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-vault-blue">
            Sign Up
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
              aria-describedby={state.error ? errorId : undefined}
              aria-invalid={state.error ? true : undefined}
              placeholder="arjun@example.com"
              className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor={passwordId} className="text-sm font-semibold text-ink">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-vault-blue">
              Forgot?
            </Link>
          </div>
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
              aria-describedby={state.error ? errorId : undefined}
              aria-invalid={state.error ? true : undefined}
              placeholder="••••••••"
              className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            />
          </div>
        </div>

        <Button type="submit" disabled={pending} className="mt-2.5 w-full py-3 text-[15px]">
          {pending ? "Signing In…" : "Sign In"}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </form>
    </AuthCard>
  );
}
