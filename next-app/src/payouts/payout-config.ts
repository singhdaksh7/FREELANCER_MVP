// Deliberately does NOT import "server-only" — src/worker scripts (plain
// Node, outside Next's bundler) may need this too, the same constraint
// documented in src/storage/storage-config.ts.

/**
 * Test-mode payout configuration — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md
 * "Test-mode payout limitation." No real bank account is ever contacted in
 * this phase; PAYOUT_PROVIDER selects only which simulation implementation
 * runs, and production must reject the fake provider (enforced in
 * src/payouts/payout-provider.ts's getPayoutProvider()).
 */

export type PayoutProviderName = "fake";

export interface PayoutConfig {
  provider: PayoutProviderName;
  /** Hours a freshly-credited ledger entry stays PENDING before it's eligible to move to AVAILABLE — configurable, never a hardcoded 24/48/56. */
  holdHours: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

export function getPayoutConfig(): PayoutConfig {
  const provider = (process.env.PAYOUT_PROVIDER ?? "fake") as PayoutProviderName;
  return {
    provider,
    holdHours: intEnv("PAYOUT_HOLD_HOURS", 48),
  };
}
