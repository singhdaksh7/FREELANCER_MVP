import { describe, expect, it } from "vitest";
import { calculatePaymentBreakdown, getPlatformFeeBps, DEFAULT_PLATFORM_FEE_BPS } from "./platform-fee";

describe("getPlatformFeeBps", () => {
  it("always returns 0 — the platform fee was removed in Phase 8", () => {
    expect(getPlatformFeeBps()).toBe(DEFAULT_PLATFORM_FEE_BPS);
    expect(getPlatformFeeBps()).toBe(0);
  });

  it("ignores PLATFORM_FEE_BPS even if it is still set in the environment (legacy/ignored var)", () => {
    process.env.PLATFORM_FEE_BPS = "300";
    try {
      expect(getPlatformFeeBps()).toBe(0);
    } finally {
      delete process.env.PLATFORM_FEE_BPS;
    }
  });
});

describe("calculatePaymentBreakdown — no platform fee", () => {
  it("gross amount equals freelancer payable, platform fee is zero, no hidden deduction occurs", () => {
    const result = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1_000_000), currency: "INR" }); // ₹10,000.00
    expect(result.clientChargedSubunits).toBe(BigInt(1_000_000));
    expect(result.platformFeeBps).toBe(0);
    expect(result.platformFeeSubunits).toBe(BigInt(0));
    expect(result.freelancerPayableSubunits).toBe(BigInt(1_000_000));
  });

  it("keeps freelancerPayable + platformFee exactly equal to the project amount for arbitrary inputs", () => {
    for (const amount of [BigInt(1), BigInt(7), BigInt(999), BigInt(123_456_789)]) {
      const result = calculatePaymentBreakdown({ projectAmountSubunits: amount, currency: "INR" });
      expect(result.platformFeeSubunits).toBe(BigInt(0));
      expect(result.freelancerPayableSubunits).toBe(amount);
      expect(result.platformFeeSubunits + result.freelancerPayableSubunits).toBe(amount);
    }
  });
});

describe("calculatePaymentBreakdown — validation", () => {
  it("rejects a zero or negative amount", () => {
    expect(() => calculatePaymentBreakdown({ projectAmountSubunits: BigInt(0), currency: "INR" })).toThrow();
    expect(() => calculatePaymentBreakdown({ projectAmountSubunits: BigInt(-100), currency: "INR" })).toThrow();
  });

  it("an explicit platformFeeBps override is still honored by the math helper itself, even though no application code path ever passes a non-zero one anymore", () => {
    const result = calculatePaymentBreakdown({ projectAmountSubunits: BigInt(1_000_000), currency: "INR", platformFeeBps: 500 });
    expect(result.platformFeeBps).toBe(500);
    expect(result.platformFeeSubunits).toBe(BigInt(50_000));
  });
});
