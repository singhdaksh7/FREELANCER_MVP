import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthenticatedCreator } from "@/data-access/auth";
import { RegisterForm } from "@/components/auth/register-form";
import { prewarmCombinedWorkerForLogin } from "@/lib/worker-wake";
import { getClientIpFromHeaders } from "@/lib/rate-limit";

export const metadata: Metadata = {
  title: "Create Account",
};

export default async function RegisterPage() {
  const creator = await getAuthenticatedCreator();
  if (creator) redirect("/dashboard");

  // Shares the /login auth layout and the same "not warm yet by the time
  // this session reaches uploads" rationale — see
  // prewarmCombinedWorkerForLogin. Best-effort, fire-and-forget, and
  // wrapped so an unexpected throw here can never break this render.
  try {
    prewarmCombinedWorkerForLogin(getClientIpFromHeaders(await headers()));
  } catch {
    // Intentionally swallowed — see comment above.
  }

  return <RegisterForm />;
}
