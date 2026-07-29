import type { Metadata } from "next";
import { ShieldAlert, TestTube2 } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { getPayoutConfig } from "@/payouts/payout-config";

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
              Live payouts are unavailable in this phase. Project Vault does not collect bank account numbers, IFSC
              codes, cancelled cheques, PAN, Aadhaar, or any other identity documents today. A future phase will
              integrate an approved marketplace or payout provider to support real, verified payouts.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-line px-4 py-3 text-xs text-ink-muted">
          <span className="font-semibold text-danger">Live payouts unavailable.</span> This account cannot receive
          real money through Project Vault yet.
        </div>
      </div>
    </div>
  );
}
