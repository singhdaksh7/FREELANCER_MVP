import { describe, expect, it } from "vitest";
import { sumDecimals, toDecimal, toDisplayNumber } from "./decimal";

describe("decimal helpers", () => {
  it("converts a Prisma Decimal-shaped string to a display number", () => {
    expect(toDisplayNumber("25000.00")).toBe(25000);
  });

  it("sums Decimal-like values without binary floating-point drift", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in native JS floating point.
    expect(toDisplayNumber(sumDecimals(["0.10", "0.20"]))).toBe(0.3);
  });

  it("accepts numbers, strings, and existing Decimal instances interchangeably", () => {
    const fromNumber = toDecimal(1000);
    const fromString = toDecimal("1000");
    const fromDecimal = toDecimal(fromNumber);

    expect(fromNumber.equals(fromString)).toBe(true);
    expect(fromDecimal).toBe(fromNumber);
  });

  it("computes net payout (amount minus fee) using Decimal arithmetic", () => {
    const amount = toDecimal("30000.00");
    const fee = toDecimal("750.00");
    expect(toDisplayNumber(amount.minus(fee))).toBe(29250);
  });
});
