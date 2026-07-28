import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedCreator } from "@/data-access/auth";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create Account",
};

export default async function RegisterPage() {
  const creator = await getAuthenticatedCreator();
  if (creator) redirect("/dashboard");

  return <RegisterForm />;
}
