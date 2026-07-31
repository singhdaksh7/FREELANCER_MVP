/**
 * Platform-fee breakdown calculation — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md.
 * Phase 8 removed INLAY's platform fee entirely: freelancers keep 100% of
 * every payment. `getPlatformFeeBps()` always returns 0 — `PLATFORM_FEE_BPS`
 * is no longer read from the environment (it may still be set, harmlessly,
 * as a legacy/ignored variable during rollout). Integer-subunit math only
 * (BigInt), never floating point. Frozen once at payment-order creation
 * time (see payment-orders.ts) so a historical payment's breakdown is
 * never recalculated after the fact.
 */

/** Always 0 — see module doc comment above. */
export const DEFAULT_PLATFORM_FEE_BPS = 0;
const BPS_DENOMINATOR = BigInt(10_000);

export function getPlatformFeeBps(): number {
  return DEFAULT_PLATFORM_FEE_BPS;
}

export interface PaymentBreakdownInput {
  projectAmountSubunits: bigint;
  currency: string;
  platformFeeBps?: number;
}

export interface PaymentBreakdownResult {
  projectAmountSubunits: bigint;
  /** Equal to projectAmountSubunits for the current MVP policy — the platform fee is deducted from the freelancer side, never added on top of what the client pays. */
  clientChargedSubunits: bigint;
  platformFeeBps: number;
  platformFeeSubunits: bigint;
  /** projectAmountSubunits - platformFeeSubunits. Gateway fees are tracked separately (gatewayFeeSubunits, set later) and are never silently deducted here. */
  freelancerPayableSubunits: bigint;
  currency: string;
}

/**
 * projectAmountSubunits * bps / 10000, using integer division that always
 * rounds the fee DOWN (floor) — so freelancerPayableSubunits + feeSubunits
 * never exceeds projectAmountSubunits by a rounding artifact. The
 * one-paisa-or-less remainder from rounding stays with the freelancer,
 * never silently vanishes and never both/neither side gets it.
 */
export function calculatePaymentBreakdown(input: PaymentBreakdownInput): PaymentBreakdownResult {
  if (input.projectAmountSubunits <= BigInt(0)) {
    throw new Error("projectAmountSubunits must be positive.");
  }
  const platformFeeBps = input.platformFeeBps ?? getPlatformFeeBps();
  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0) {
    throw new Error("platformFeeBps must be a non-negative integer.");
  }

  const platformFeeSubunits = (input.projectAmountSubunits * BigInt(platformFeeBps)) / BPS_DENOMINATOR;
  const freelancerPayableSubunits = input.projectAmountSubunits - platformFeeSubunits;

  return {
    projectAmountSubunits: input.projectAmountSubunits,
    clientChargedSubunits: input.projectAmountSubunits,
    platformFeeBps,
    platformFeeSubunits,
    freelancerPayableSubunits,
    currency: input.currency,
  };
}
