import { describe, expect, it } from "vitest";
import {
  decimalAmountToSubunits,
  subunitsToDecimalString,
  assertSupportedCurrency,
  UnsupportedAmountPrecisionError,
  AmountOutOfBoundsError,
  UnsupportedCurrencyError,
  MAX_ORDER_AMOUNT_SUBUNITS,
} from "./payment-amount";

describe("decimalAmountToSubunits", () => {
  it("converts a whole-rupee amount to paise", () => {
    expect(decimalAmountToSubunits("25000", "INR")).toBe(BigInt(2_500_000));
  });

  it("converts a two-decimal amount to paise without floating-point drift", () => {
    // 100.10 * 100 in native float multiplication is 10009.999999999998.
    expect(decimalAmountToSubunits("100.10", "INR")).toBe(BigInt(10010));
  });

  it("accepts a number input via toFixed-style precision", () => {
    expect(decimalAmountToSubunits(30000, "INR")).toBe(BigInt(3_000_000));
  });

  it("pads a one-decimal amount", () => {
    expect(decimalAmountToSubunits("99.5", "INR")).toBe(BigInt(9950));
  });

  it("tolerates trailing zeros beyond supported precision", () => {
    expect(decimalAmountToSubunits("100.500", "INR")).toBe(BigInt(10050));
  });

  it("rejects unsupported precision (a genuine third decimal digit)", () => {
    expect(() => decimalAmountToSubunits("100.001", "INR")).toThrow(UnsupportedAmountPrecisionError);
  });

  it("rejects a non-numeric string", () => {
    expect(() => decimalAmountToSubunits("not-a-number", "INR")).toThrow(UnsupportedAmountPrecisionError);
  });

  it("rejects zero", () => {
    expect(() => decimalAmountToSubunits("0", "INR")).toThrow(AmountOutOfBoundsError);
  });

  it("rejects a negative amount", () => {
    expect(() => decimalAmountToSubunits("-5", "INR")).toThrow(AmountOutOfBoundsError);
  });

  it("rejects an amount beyond the maximum supported order amount", () => {
    expect(() => decimalAmountToSubunits("99999999999", "INR")).toThrow(AmountOutOfBoundsError);
  });

  it("rejects an unsupported currency", () => {
    expect(() => decimalAmountToSubunits("100", "USD")).toThrow(UnsupportedCurrencyError);
  });
});

describe("subunitsToDecimalString", () => {
  it("is the exact inverse of decimalAmountToSubunits for a two-decimal amount", () => {
    const subunits = decimalAmountToSubunits("25000.50", "INR");
    expect(subunitsToDecimalString(subunits, "INR")).toBe("25000.50");
  });

  it("formats a sub-100-paise amount with a leading zero", () => {
    expect(subunitsToDecimalString(BigInt(5), "INR")).toBe("0.05");
  });

  it("formats an exact-rupee amount with .00", () => {
    expect(subunitsToDecimalString(BigInt(100), "INR")).toBe("1.00");
  });
});

describe("assertSupportedCurrency", () => {
  it("does not throw for INR", () => {
    expect(() => assertSupportedCurrency("INR")).not.toThrow();
  });

  it("throws for any other currency, never silently converting", () => {
    expect(() => assertSupportedCurrency("USD")).toThrow(UnsupportedCurrencyError);
    expect(() => assertSupportedCurrency("EUR")).toThrow(UnsupportedCurrencyError);
  });
});

describe("MAX_ORDER_AMOUNT_SUBUNITS", () => {
  it("matches Razorpay's documented Standard Checkout ceiling (₹1,50,00,000)", () => {
    expect(MAX_ORDER_AMOUNT_SUBUNITS).toBe(BigInt(1_500_000_000));
  });
});
