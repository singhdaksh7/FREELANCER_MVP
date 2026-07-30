/**
 * 2% platform-fee breakdown calculation — see
 * PLATFORM_FEE_AND_PAYOUT_LEDGER.md. Integer-subunit math only (BigInt),
 * never floating point. Frozen once at payment-order creation time (see
 * payment-orders.ts) and never recalculated for a historical payment if
 * this policy changes later — only new orders pick up a changed
 * PLATFORM_FEE_BPS.
 */

/** 200 basis points = 2.00%. Not hardcoded inline at call sites — see getPlatformFeeBps(). */
export const DEFAULT_PLATFORM_FEE_BPS = 200;
const BPS_DENOMINATOR = BigInt(10_000);

export function getPlatformFeeBps(): number {
  const raw = process.env.PLATFORM_FEE_BPS;
  if (!raw) return DEFAULT_PLATFORM_FEE_BPS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > BPS_DENOMINATOR) {
    throw new Error(`PLATFORM_FEE_BPS must be an integer between 0 and ${BPS_DENOMINATOR}.`);
  }
  return parsed;
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
