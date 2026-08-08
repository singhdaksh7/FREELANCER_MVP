"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
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
    <AuthShell tagline="Welcome back. Sign in to your INLAY workspace.">
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-[-0.015em] text-[#0b1c30]">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[14px] text-[#5c5f61]">
          Sign in to continue to your INLAY workspace.
        </p>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-5">
        {/* Error message */}
        <div aria-live="polite">
          {state.error && (
            <p
              id={errorId}
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
            >
              {state.error}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className="text-[13px] font-medium text-[#424654]">
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
            placeholder="name@company.com"
            className={`h-[52px] w-full rounded-lg border bg-[#f8f9ff] px-4 text-[14px] text-[#0b1c30] outline-none placeholder:text-[#c2c6d7] transition-all disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#5c5f61]
              ${
                state.error
                  ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                  : "border-[#c2c6d7] focus:border-[#1C68E7] focus:bg-white focus:ring-2 focus:ring-[#1C68E7]/18"
              }`}
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={passwordId} className="text-[13px] font-medium text-[#424654]">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[12px] font-semibold text-[#1C68E7] transition-colors hover:text-[#1555C0] focus-visible:outline-none focus-visible:underline"
            >
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
              placeholder="••••••••"
              className={`h-[52px] w-full rounded-lg border bg-[#f8f9ff] py-0 pl-4 pr-12 text-[14px] text-[#0b1c30] outline-none placeholder:text-[#c2c6d7] transition-all disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#5c5f61]
                ${
                  state.error
                    ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                    : "border-[#c2c6d7] focus:border-[#1C68E7] focus:bg-white focus:ring-2 focus:ring-[#1C68E7]/18"
                }`}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(!showPassword)}
              disabled={pending}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded text-[#5c5f61] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 disabled:opacity-40"
            >
              {showPassword ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#1C68E7] px-6 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1555C0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
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

      {/* Footer link */}
      <p className="mt-8 text-center text-[13px] text-[#5c5f61]">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-[#1C68E7] transition-colors hover:text-[#1555C0] focus-visible:outline-none focus-visible:underline"
        >
          Sign Up
        </Link>
      </p>
    </AuthShell>
  );
}
