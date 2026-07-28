import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearchTerm } from "./search";

describe("normalizeSearchTerm", () => {
  it("trims and lowercases", () => {
    expect(normalizeSearchTerm("  Rohit Sharma  ")).toBe("rohit sharma");
  });
});

describe("matchesSearch", () => {
  it("matches case-insensitively across multiple fields", () => {
    expect(matchesSearch("sharma", ["Rohit Sharma", "rohit@designtech.io"])).toBe(true);
    expect(matchesSearch("DESIGNTECH", ["Rohit Sharma", "rohit@designtech.io"])).toBe(true);
  });

  it("returns false when no field contains the term", () => {
    expect(matchesSearch("priya", ["Rohit Sharma", "rohit@designtech.io"])).toBe(false);
  });

  it("treats an empty term as matching everything", () => {
    expect(matchesSearch("", ["Rohit Sharma"])).toBe(true);
    expect(matchesSearch("   ", ["Rohit Sharma"])).toBe(true);
  });

  it("ignores undefined fields", () => {
    expect(matchesSearch("sharma", [undefined, "Rohit Sharma"])).toBe(true);
  });
});
