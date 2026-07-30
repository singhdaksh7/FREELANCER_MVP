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

  describe("workspace amount parsing (Server Action → Decimal boundary)", () => {
    // These mirror the exact string shapes the Zod amount schema
    // (src/validation/workspace.ts) allows through before this conversion
    // ever runs — see workspace.test.ts for the validation side.
    it("parses a plain integer amount string with no precision loss", () => {
      expect(toDisplayNumber(toDecimal("25000"))).toBe(25000);
    });

    it("parses a two-decimal amount string with no precision loss", () => {
      expect(toDisplayNumber(toDecimal("25000.50"))).toBe(25000.5);
    });

    it("compares a re-submitted amount string against a stored Decimal by value, not by string identity", () => {
      const stored = toDecimal("25000.00");
      expect(toDecimal("25000").equals(stored)).toBe(true);
      expect(toDecimal("25000.01").equals(stored)).toBe(false);
    });

    it("stays exact for a large amount within the schema's Decimal(12, 2) capacity", () => {
      expect(toDisplayNumber(toDecimal("9999999999.99"))).toBe(9999999999.99);
    });
  });
});
