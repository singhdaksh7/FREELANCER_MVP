import { describe, expect, it } from "vitest";
import { formatINR } from "./format-currency";

describe("formatINR", () => {
  it("formats a rupee amount with the ₹ symbol and Indian digit grouping", () => {
    expect(formatINR(25000)).toBe("₹25,000");
    expect(formatINR(250000)).toBe("₹2,50,000");
  });

  it("rounds to whole rupees", () => {
    expect(formatINR(1999.6)).toBe("₹2,000");
  });

  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0");
  });
});
