import Link from "next/link";
import { Info } from "lucide-react";
import { AuthCard } from "./auth-card";

/**
 * Password recovery has no email-sending infrastructure yet (deferred to
 * a later phase — see MIGRATION_STATUS.md). This states that plainly
 * instead of pretending to send a reset email; there is no form here
 * because there is nothing yet for a submission to do.
 */
export function ForgotPasswordNotice() {
  return (
    <AuthCard
      heading="Reset Password"
      subheading="Password recovery is not available yet"
      footer={
        <Link href="/login" className="font-semibold text-vault-blue">
          Back to Sign In
        </Link>
      }
    >
      <div className="flex items-start gap-3 rounded-md bg-vault-blue-light px-4 py-3.5 text-sm text-ink">
        <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-vault-blue" />
        <p>
          Password recovery isn&apos;t enabled in this development build yet — no reset email will
          be sent. If you need access, use one of the seeded demo accounts documented in{" "}
          <code className="rounded bg-white px-1 py-0.5 text-xs">DATABASE_SETUP.md</code>.
        </p>
      </div>
    </AuthCard>
  );
}
