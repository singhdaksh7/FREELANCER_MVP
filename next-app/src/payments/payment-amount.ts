// Deliberately does NOT import "server-only" — src/worker/process-deliveries.ts
// (a plain Node script run via tsx, outside Next's bundler) needs these
// helpers too, the same pre-existing constraint documented in
// src/storage/storage-config.ts.

/**
 * Decimal-safe INR amount <-> subunit (paise) conversion — see
 * PAYMENT_ARCHITECTURE.md "Amount handling." Never uses floating-point
 * multiplication: every conversion works from the Decimal's own string
 * representation, split at the decimal point, so 100.10 can never become
 * 10009 or 10011 paise through binary rounding error.
 */

export class UnsupportedAmountPrecisionError extends Error {
  constructor(message = "Amount has more precision than this currency supports.") {
    super(message);
    this.name = "UnsupportedAmountPrecisionError";
  }
}

export class AmountOutOfBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountOutOfBoundsError";
  }
}

export class UnsupportedCurrencyError extends Error {
  constructor(message = "Unsupported currency.") {
    super(message);
    this.name = "UnsupportedCurrencyError";
  }
}

/** MVP currency allow-list — see PAYMENT_ARCHITECTURE.md "Currency scope." */
export const SUPPORTED_PAYMENT_CURRENCIES = ["INR"] as const;
export type SupportedPaymentCurrency = (typeof SUPPORTED_PAYMENT_CURRENCIES)[number];

/** Every supported currency here is 2 decimal-place, 100 subunits per unit (paise per rupee). Kept as an explicit map (not a hardcoded "* 100") so adding a currency later is a data change, not a silent formula assumption. */
const SUBUNITS_PER_UNIT: Record<SupportedPaymentCurrency, number> = {
  INR: 100,
};

/** Razorpay's own documented order-amount ceiling is 15,000,000 INR (1,500,000,000 paise) for standard checkout. Enforced here so an obviously-wrong amount fails fast, locally, with a clear message rather than an opaque gateway rejection. */
export const MAX_ORDER_AMOUNT_SUBUNITS = BigInt(1_500_000_000);

export function assertSupportedCurrency(currency: string): asserts currency is SupportedPaymentCurrency {
  if (!(SUPPORTED_PAYMENT_CURRENCIES as readonly string[]).includes(currency)) {
    throw new UnsupportedCurrencyError(`Unsupported currency: "${currency}". Only INR is supported in this MVP.`);
  }
}

/**
 * Converts a decimal amount (accepted as a string or number — callers pass
 * `Decimal.toString()`, never a raw float multiplication) to integer
 * subunits. Rejects more fractional precision than the currency supports
 * (e.g. "100.005" for INR) and non-positive amounts.
 */
export function decimalAmountToSubunits(amount: string | number, currency: string): bigint {
  assertSupportedCurrency(currency);
  const perUnit = SUBUNITS_PER_UNIT[currency];
  const decimalPlaces = String(perUnit).length - 1;

  const raw = typeof amount === "number" ? amount.toFixed(decimalPlaces + 4) : amount.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    throw new UnsupportedAmountPrecisionError(`Amount "${raw}" is not a valid decimal number.`);
  }
  const [, sign, wholePart, fractionPartRaw = ""] = match;
  if (sign === "-") {
    throw new AmountOutOfBoundsError("Amount must be positive.");
  }
  if (fractionPartRaw.length > decimalPlaces) {
    // Trailing zeros beyond the supported precision are fine (e.g.
    // "100.500" for a 2-decimal currency written from a float .toFixed);
    // any non-zero digit beyond that precision is rejected.
    if (/[1-9]/.test(fractionPartRaw.slice(decimalPlaces))) {
      throw new UnsupportedAmountPrecisionError(
        `Amount "${raw}" has more precision than ${currency} supports (max ${decimalPlaces} decimal places).`,
      );
    }
  }
  const fractionPart = fractionPartRaw.slice(0, decimalPlaces).padEnd(decimalPlaces, "0");

  const subunits = BigInt(wholePart) * BigInt(perUnit) + BigInt(fractionPart || "0");
  if (subunits <= BigInt(0)) {
    throw new AmountOutOfBoundsError("Amount must be greater than zero.");
  }
  if (subunits > MAX_ORDER_AMOUNT_SUBUNITS) {
    throw new AmountOutOfBoundsError("Amount exceeds the maximum supported order amount.");
  }
  return subunits;
}

/** Converts integer subunits back to a decimal string suitable for a Prisma Decimal column or display formatting — the exact inverse of decimalAmountToSubunits, never a float division. */
export function subunitsToDecimalString(subunits: bigint, currency: string): string {
  assertSupportedCurrency(currency);
  const perUnit = BigInt(SUBUNITS_PER_UNIT[currency]);
  const decimalPlaces = String(SUBUNITS_PER_UNIT[currency]).length - 1;
  const whole = subunits / perUnit;
  const fraction = (subunits % perUnit).toString().padStart(decimalPlaces, "0");
  return `${whole}.${fraction}`;
}
