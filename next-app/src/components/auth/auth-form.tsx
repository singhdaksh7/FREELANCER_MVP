"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Key, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { useToastMessage } from "@/hooks/use-toast-message";

export type AuthMode = "login" | "register" | "forgot";

export interface AuthFormProps {
  mode: AuthMode;
}

const COPY: Record<AuthMode, { heading: string; subheading: string; cta: string }> = {
  login: {
    heading: "Sign in to Project Vault",
    subheading: "Enter your credentials to access your workspaces",
    cta: "Sign In",
  },
  register: {
    heading: "Create Freelancer Account",
    subheading: "Start delivering payment-gated work to clients",
    cta: "Create Account",
  },
  forgot: {
    heading: "Reset Password",
    subheading: "We will send a recovery link to your inbox",
    cta: "Send Reset Link",
  },
};

/**
 * Visual-only auth form for Phase 1. Submitting never authenticates,
 * navigates, or persists anything (no localStorage/sessionStorage) —
 * it only shows a demo toast, per the migration scope for this phase.
 */
export function AuthForm({ mode }: AuthFormProps) {
  const { toast, showToast } = useToastMessage();
  const [email, setEmail] = useState(mode === "login" ? "arjun@example.com" : "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const { heading, subheading, cta } = COPY[mode];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    showToast(
      "Demo only — authentication is not implemented in this phase.",
      "info",
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-vault-navy p-6">
      <div className="w-full max-w-[440px] rounded-lg bg-white p-10 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-vault-blue">
            <Lock size={24} color="#FFFFFF" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink">{heading}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subheading}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          {mode === "register" && (
            <div>
              <label
                htmlFor={nameId}
                className="mb-1.5 block text-sm font-semibold text-ink"
              >
                Full Name
              </label>
              <input
                id={nameId}
                name="name"
                type="text"
                placeholder="Arjun Raj"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
            </div>
          )}

          <div>
            <label
              htmlFor={emailId}
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="arjun@example.com"
                className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              />
            </div>
          </div>

          {mode !== "forgot" && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor={passwordId} className="text-sm font-semibold text-ink">
                  Password
                </label>
                {mode === "login" && (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-vault-blue"
                  >
                    Forgot?
                  </Link>
                )}
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-line py-2.5 pl-10 pr-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                />
              </div>
            </div>
          )}

          <Button type="submit" className="mt-2.5 w-full py-3 text-[15px]">
            {cta}
            <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-ink-muted">
          {mode === "login" && (
            <span>
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-semibold text-vault-blue">
                Sign Up
              </Link>
            </span>
          )}
          {mode !== "login" && (
            <span>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-vault-blue">
                Sign In
              </Link>
            </span>
          )}
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
