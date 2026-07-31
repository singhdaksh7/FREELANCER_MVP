import type { Metadata } from "next";
import { ShieldAlert, TestTube2, LifeBuoy, Mail, Phone } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { getPayoutConfig } from "@/payouts/payout-config";
import { BRAND } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Minimal creator settings — currently just the payout/KYC informational
 * placeholder (Phase 7.5). No bank details, identity documents, or any
 * other PII are collected here or anywhere else in this phase — see
 * PLATFORM_FEE_AND_PAYOUT_LEDGER.md "No real KYC or live payout."
 */
export default function SettingsPage() {
  const { provider, holdHours } = getPayoutConfig();
  const testModeActive = provider === "fake";

  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE;
  const supportPhoneDigits = supportPhone?.replace(/[^\d]/g, "");

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Settings" description="Account and payout configuration" />

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-6">
        <h2 className="text-sm font-bold text-ink">Payout Settings</h2>

        <div className="flex items-start gap-3 rounded-md bg-slate-50 p-4">
          <TestTube2 size={18} className="mt-0.5 shrink-0 text-vault-blue" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">{testModeActive ? "Test mode active" : "Not configured"}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {testModeActive
                ? `Payouts are simulated for testing — no real bank account is contacted and no funds are transferred. A captured payment's freelancer-payable amount is credited to your ledger and held for ${holdHours} hours before it can be marked available.`
                : "No payout provider is configured."}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-md bg-amber-50 p-4">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">Verification required for live payouts</p>
            <p className="mt-1 text-xs text-ink-muted">
              Live payouts are unavailable in this phase. {BRAND.productName} does not collect bank account numbers, IFSC
              codes, cancelled cheques, PAN, Aadhaar, or any other identity documents today. A future phase will
              integrate an approved marketplace or payout provider to support real, verified payouts.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-line px-4 py-3 text-xs text-ink-muted">
          <span className="font-semibold text-danger">Live payouts unavailable.</span> This account cannot receive
          real money through {BRAND.productName} yet.
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-6">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <LifeBuoy size={16} className="text-vault-blue" aria-hidden="true" /> Support
        </h2>
        <p className="text-sm text-ink-muted">
          Need help with a workspace, payment, or your account? Reach out and we&apos;ll get back to you.
        </p>

        {supportEmail ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <a
              href={`mailto:${supportEmail}`}
              className="inline-flex w-fit items-center gap-1.5 rounded-md bg-vault-blue px-4 py-2 text-sm font-semibold text-white hover:bg-vault-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            >
              <Mail size={14} aria-hidden="true" /> Contact Support
            </a>
            {supportPhoneDigits && (
              <a
                href={`https://wa.me/${supportPhoneDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              >
                <Phone size={14} aria-hidden="true" /> WhatsApp
              </a>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-slate-50 px-3.5 py-2.5 text-xs text-ink-muted">
            Support contact is not configured.
          </p>
        )}
      </div>
    </div>
  );
}
