import { afterEach, describe, expect, it } from "vitest";
import { calculatePaymentBreakdown, getPlatformFeeBps, DEFAULT_PLATFORM_FEE_BPS } from "./platform-fee";

afterEach(() => {
  delete process.env.PLATFORM_FEE_BPS;
});

describe("getPlatformFeeBps", () => {
  it("defaults to 200 bps (2%)", () => {
    expect(getPlatformFeeBps()).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(getPlatformFeeBps()).toBe(200);
  });

  it("respects an explicit override", () => {
    process.env.PLATFORM_FEE_BPS = "300";
    expect(getPlatformFeeBps()).toBe(300);
  });

  it("rejects a non-integer override", () => {
    process.env.PLATFORM_FEE_BPS = "2.5";
    expect(() => getPlatformFeeBps()).toThrow();
  });

  it("rejects a negative override", () => {
    process.env.PLATFORM_FEE_BPS = "-1";
    expect(() => getPlatformFeeBps()).toThrow();
  });
});

describe("calculatePaymentBreakdown — the ₹10,000 example from the spec", () => {
  it("computes client-charged = project amount, 2% fee, and freelancer payable = project amount - fee", () => {
    const result = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1_000_000), currency: "INR" }); // ₹10,000.00
    expect(result.clientChargedSubunits).toBe(BigInt(1_000_000)); // client pays exactly what was approved
    expect(result.platformFeeBps).toBe(200);
    expect(result.platformFeeSubunits).toBe(BigInt(20_000)); // ₹200.00
    expect(result.freelancerPayableSubunits).toBe(BigInt(980_000)); // ₹9,800.00
  });
});

describe("calculatePaymentBreakdown — integer subunit rounding", () => {
  it("rounds the fee down (floor), never up, and never loses or double-counts the remainder", () => {
    // ₹0.01 (1 paisa) at 2% = 0.02 paise -> floors to 0.
    const result = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1), currency: "INR" });
    expect(result.platformFeeSubunits).toBe(BigInt(0));
    expect(result.freelancerPayableSubunits).toBe(BigInt(1));
  });

  it("keeps freelancerPayable + platformFee exactly equal to the project amount for arbitrary inputs", () => {
    for (const amount of [BigInt(1), BigInt(7), BigInt(999), BigInt(123_456_789)]) {
      const result = calculatePaymentBreakdown({ projectAmountSubunits: amount, currency: "INR" });
      expect(result.platformFeeSubunits + result.freelancerPayableSubunits).toBe(amount);
    }
  });

  it("never uses floating-point division — a value indivisible by 10000 still splits exactly", () => {
    const result = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(333), currency: "INR" }); // ₹3.33
    // 333 * 200 / 10000 = 6.66 -> floors to 6
    expect(result.platformFeeSubunits).toBe(BigInt(6));
    expect(result.freelancerPayableSubunits).toBe(BigInt(327));
  });
});

describe("calculatePaymentBreakdown — validation", () => {
  it("rejects a zero or negative amount", () => {
    expect(() => calculatePaymentBreakdown({ projectAmountSubunits: BigInt(0), currency: "INR" })).toThrow();
    expect(() => calculatePaymentBreakdown({ projectAmountSubunits: BigInt(-100), currency: "INR" })).toThrow();
  });

  it("accepts an explicit platformFeeBps override, ignoring the env var", () => {
    process.env.PLATFORM_FEE_BPS = "999";
    const result = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1_000_000), currency: "INR", platformFeeBps: 500 });
    expect(result.platformFeeBps).toBe(500);
    expect(result.platformFeeSubunits).toBe(BigInt(50_000));
  });
});

describe("calculatePaymentBreakdown — historical fee immutability", () => {
  it("a later change to PLATFORM_FEE_BPS does not affect a breakdown already computed and stored", () => {
    const first = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1_000_000), currency: "INR" });
    process.env.PLATFORM_FEE_BPS = "500";
    // `first` is a plain object already returned/stored — recomputing later
    // with a different global config produces a different result, proving
    // the caller must persist `first` itself rather than recomputing on read.
    const second = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1_000_000), currency: "INR" });
    expect(first.platformFeeBps).toBe(200);
    expect(second.platformFeeBps).toBe(500);
    expect(first.platformFeeSubunits).not.toBe(second.platformFeeSubunits);
  });
});
