import type { Metadata } from "next";
import { ForgotPasswordNotice } from "@/components/auth/forgot-password-notice";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordNotice />;
}
