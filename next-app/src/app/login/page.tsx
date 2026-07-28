import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedCreator } from "@/data-access/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage() {
  const creator = await getAuthenticatedCreator();
  if (creator) redirect("/dashboard");

  return <LoginForm />;
}
