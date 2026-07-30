import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize-email";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  arjun@example.com  ")).toBe("arjun@example.com");
  });

  it("lowercases the whole address", () => {
    expect(normalizeEmail("Arjun@Example.COM")).toBe("arjun@example.com");
  });

  it("makes two differently-cased inputs compare equal", () => {
    expect(normalizeEmail("Arjun@Example.com")).toBe(normalizeEmail("arjun@example.com"));
  });
});
