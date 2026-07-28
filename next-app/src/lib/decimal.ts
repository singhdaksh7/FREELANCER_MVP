// Imports from the browser-safe entrypoint (not `.../client`) so this
// module never accidentally pulls Prisma Client's Node-only runtime into
// a Client Component bundle.
import { Prisma } from "@/generated/prisma/browser";

/**
 * Decimal-safe helpers for money coming out of Prisma. `amount`/`fee`/etc.
 * columns are `Decimal` (decimal.js under the hood) specifically so
 * arithmetic never touches binary floating point. Sum with these helpers
 * (which stay in Decimal the whole way through), and only convert to a
 * plain `number` once, at the very end, for `Intl.NumberFormat` — never
 * sum or multiply floats and never round mid-calculation.
 */

type Decimal = InstanceType<typeof Prisma.Decimal>;

export type DecimalLike = Decimal | number | string;

export function toDecimal(value: DecimalLike): Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function sumDecimals(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(toDecimal(value)), new Prisma.Decimal(0));
}

/** Single, final conversion to a plain number for display formatting only. */
export function toDisplayNumber(value: DecimalLike): number {
  return toDecimal(value).toNumber();
}
