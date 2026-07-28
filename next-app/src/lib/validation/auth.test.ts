import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth";

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      name: "Arjun Raj",
      email: "arjun@example.com",
      password: "Demo@12345",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      name: "Arjun Raj",
      email: "arjun@example.com",
      password: "Ab1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password?.[0]).toMatch(/at least 8 characters/i);
    }
  });

  it("rejects a password with no digits", () => {
    const result = registerSchema.safeParse({
      name: "Arjun Raj",
      email: "arjun@example.com",
      password: "OnlyLetters",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no letters", () => {
    const result = registerSchema.safeParse({
      name: "Arjun Raj",
      email: "arjun@example.com",
      password: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      name: "Arjun Raj",
      email: "not-an-email",
      password: "Demo@12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = registerSchema.safeParse({
      name: "A",
      email: "arjun@example.com",
      password: "Demo@12345",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a non-empty password but does not enforce complexity (that's a registration-only rule)", () => {
    const result = loginSchema.safeParse({ email: "arjun@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "arjun@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});
