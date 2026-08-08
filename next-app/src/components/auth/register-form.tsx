"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { registerAction, type AuthActionState } from "@/actions/auth";

const initialState: AuthActionState = {};

/**
 * Real registration via a Server Action: Zod-validated, hashes the password,
 * prevents duplicate emails, then establishes a session.
 *
 * The "Confirm Password" field is client-side only — it is validated for
 * match against "password" before submit and never sent to the server.
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const errorId = useId();
  const passwordErrorId = useId();
  const confirmErrorId = useId();

  const confirmMismatch = confirmTouched && confirmValue !== passwordValue && confirmValue.length > 0;

  return (
    <AuthShell>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-[-0.015em] text-[#0b1c30]">
          Create your INLAY account
        </h1>
        <p className="mt-1.5 text-[14px] text-[#5c5f61]">
          Start sharing work professionally with your clients.
        </p>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-5">
        {/* Server-side error */}
        {state.error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
          >
            {state.error}
          </p>
        )}

        {/* Full Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-[13px] font-medium text-[#424654]">
            Full Name
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            required
            disabled={pending}
            defaultValue={state.values?.name ?? ""}
            aria-describedby={state.fieldErrors?.name ? `${nameId}-error` : undefined}
            aria-invalid={!!state.fieldErrors?.name}
            placeholder="Jane Doe"
            className={`h-[52px] w-full rounded-lg border bg-[#f8f9ff] px-4 text-[14px] text-[#0b1c30] outline-none placeholder:text-[#c2c6d7] transition-all disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#5c5f61]
              ${
                state.fieldErrors?.name
                  ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                  : "border-[#c2c6d7] focus:border-[#1C68E7] focus:bg-white focus:ring-2 focus:ring-[#1C68E7]/18"
              }`}
          />
          {state.fieldErrors?.name && (
            <p id={`${nameId}-error`} className="text-[12px] text-red-600">
              {state.fieldErrors.name[0]}
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
            autoComplete="email"
            required
            disabled={pending}
            defaultValue={state.values?.email ?? ""}
            aria-describedby={state.fieldErrors?.email ? `${emailId}-error` : undefined}
            aria-invalid={!!state.fieldErrors?.email}
            placeholder="name@company.com"
            className={`h-[52px] w-full rounded-lg border bg-[#f8f9ff] px-4 text-[14px] text-[#0b1c30] outline-none placeholder:text-[#c2c6d7] transition-all disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#5c5f61]
              ${
                state.fieldErrors?.email
                  ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                  : "border-[#c2c6d7] focus:border-[#1C68E7] focus:bg-white focus:ring-2 focus:ring-[#1C68E7]/18"
              }`}
          />
          {state.fieldErrors?.email && (
            <p id={`${emailId}-error`} className="text-[12px] text-red-600">
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className="text-[13px] font-medium text-[#424654]">
            Password
          </label>
          <div className="relative">
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              disabled={pending}
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              aria-describedby={state.fieldErrors?.password ? passwordErrorId : undefined}
              aria-invalid={!!state.fieldErrors?.password}
              placeholder="At least 8 characters"
              className={`h-[52px] w-full rounded-lg border bg-[#f8f9ff] py-0 pl-4 pr-12 text-[14px] text-[#0b1c30] outline-none placeholder:text-[#c2c6d7] transition-all disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#5c5f61]
                ${
                  state.fieldErrors?.password
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
          {state.fieldErrors?.password ? (
            <ul id={passwordErrorId} className="flex flex-col gap-0.5">
              {state.fieldErrors.password.map((message) => (
                <li key={message} className="text-[12px] text-red-600">
                  {message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-[#5c5f61]">Use at least 8 characters</p>
          )}
        </div>

        {/* Confirm Password — client-side validation only, value not sent to server */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={confirmId} className="text-[13px] font-medium text-[#424654]">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id={confirmId}
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              required
              disabled={pending}
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              aria-describedby={confirmMismatch ? confirmErrorId : undefined}
              aria-invalid={confirmMismatch}
              placeholder="••••••••"
              className={`h-[52px] w-full rounded-lg border bg-[#f8f9ff] py-0 pl-4 pr-12 text-[14px] text-[#0b1c30] outline-none placeholder:text-[#c2c6d7] transition-all disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#5c5f61]
                ${
                  confirmMismatch
                    ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                    : "border-[#c2c6d7] focus:border-[#1C68E7] focus:bg-white focus:ring-2 focus:ring-[#1C68E7]/18"
                }`}
            />
            <button
              type="button"
              aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              onClick={() => setShowConfirm(!showConfirm)}
              disabled={pending}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded text-[#5c5f61] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 disabled:opacity-40"
            >
              {showConfirm ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </div>
          {confirmMismatch && (
            <p id={confirmErrorId} role="alert" className="text-[12px] text-red-600">
              Passwords do not match.
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending || confirmMismatch}
          className="mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-[#1C68E7] px-6 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1555C0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Creating Account…
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      {/* Footer link */}
      <p className="mt-8 text-center text-[13px] text-[#5c5f61]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-[#1C68E7] transition-colors hover:text-[#1555C0] focus-visible:outline-none focus-visible:underline"
        >
          Log In
        </Link>
      </p>
    </AuthShell>
  );
}
