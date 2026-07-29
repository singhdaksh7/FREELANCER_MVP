// Deliberately does NOT `import "server-only"` — mirrors
// src/payments/payment-config.ts's reasoning.

import { getPayoutConfig, type PayoutProviderName } from "./payout-config";
import { LiveProviderNotImplementedError } from "./payout-errors";

/**
 * Payout-provider abstraction — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md
 * "Test-mode payout limitation." Every method operates on a single
 * PayoutLedgerEntry id and performs a state-transition simulation only;
 * no method here ever contacts a real bank, collects KYC, or transfers
 * real funds. A future live provider would implement the same interface
 * and be selected here — application code never imports a concrete
 * provider directly.
 */
export interface PayoutProvider {
  readonly name: PayoutProviderName;
  markAvailable(entryId: string): Promise<void>;
  startPayout(entryId: string): Promise<void>;
  completePayout(entryId: string): Promise<void>;
  failPayout(entryId: string, reason: string): Promise<void>;
}

function assertProductionSafe(provider: PayoutProviderName): void {
  if (process.env.NODE_ENV !== "production") return;
  // Only the fake, test-mode simulation exists in this phase — so ANY
  // provider selection is unsafe in production. This is not a narrower
  // "reject fake, allow live" check (there is no live implementation yet);
  // it's a hard stop until a real provider is built and wired in here.
  throw new LiveProviderNotImplementedError(
    `Refusing to run payout simulation in production (PAYOUT_PROVIDER="${provider}") — no live payout provider is implemented yet.`,
  );
}

let cachedProvider: PayoutProvider | null = null;

/** Lazily imports the concrete provider so a plain `NODE_ENV=production` process never even loads the fake provider's module. */
export async function getPayoutProvider(): Promise<PayoutProvider> {
  if (cachedProvider) return cachedProvider;

  const { provider } = getPayoutConfig();
  assertProductionSafe(provider);

  if (provider === "fake") {
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    cachedProvider = fakePayoutProvider;
    return cachedProvider;
  }

  throw new LiveProviderNotImplementedError(`Unknown PAYOUT_PROVIDER: "${provider}".`);
}

/** Test-only hook — never called from application code. */
export function __resetPayoutProviderCacheForTests(): void {
  cachedProvider = null;
}
