import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthenticatedCreator } from "@/data-access/auth";
import { LoginForm } from "@/components/auth/login-form";
import { prewarmCombinedWorkerForLogin } from "@/lib/worker-wake";
import { getClientIpFromHeaders } from "@/lib/rate-limit";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage() {
  const creator = await getAuthenticatedCreator();
  if (creator) redirect("/dashboard");

  // Best-effort, fire-and-forget: never awaited, and wrapped so that even
  // an unexpected synchronous throw here can never break this render or
  // the login flow. See prewarmCombinedWorkerForLogin for why it's
  // already designed to never throw on its own.
  try {
    prewarmCombinedWorkerForLogin(getClientIpFromHeaders(await headers()));
  } catch {
    // Intentionally swallowed — see comment above.
  }

  return <LoginForm />;
}
