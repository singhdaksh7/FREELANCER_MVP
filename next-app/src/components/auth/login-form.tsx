"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { InlayLogo } from "@/components/brand/inlay-logo";
import { loginAction, type AuthActionState } from "@/actions/auth";

const initialState: AuthActionState = {};

/** Real credentials login via Auth.js (Server Action). Errors are always the same generic message — never reveals whether the email exists. */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 sm:p-10 shadow-sm border border-slate-200">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="mb-6">
            <InlayLogo size="lg" priority />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to manage your projects and client deliveries.
          </p>
        </div>

        <form action={formAction} noValidate className="flex flex-col gap-5">
          <div aria-live="polite">
            {state.error && (
              <p
                id={errorId}
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"
              >
                {state.error}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={emailId} className="text-sm font-medium text-slate-700">
              Email Address
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={pending}
              defaultValue={state.values?.email ?? ""}
              aria-describedby={state.error ? errorId : undefined}
              aria-invalid={state.error ? true : undefined}
              className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500
                ${state.error ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/20' : 'border-slate-300 focus-visible:border-inlay-primary focus-visible:ring-4 focus-visible:ring-inlay-primary-ring'}
              `}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={passwordId} className="text-sm font-medium text-slate-700">
                Password
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-inlay-primary hover:text-inlay-primary-hover focus-visible:outline-none focus-visible:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={pending}
                aria-describedby={state.error ? errorId : undefined}
                aria-invalid={state.error ? true : undefined}
                className={`w-full rounded-lg border py-2.5 pl-3.5 pr-10 text-sm outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500
                  ${state.error ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/20' : 'border-slate-300 focus-visible:border-inlay-primary focus-visible:ring-4 focus-visible:ring-inlay-primary-ring'}
                `}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
                disabled={pending}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inlay-primary-ring disabled:opacity-50"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-inlay-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-inlay-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inlay-primary-ring disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-inlay-primary hover:text-inlay-primary-hover focus-visible:outline-none focus-visible:underline">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
