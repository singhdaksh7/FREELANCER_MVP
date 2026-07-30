import { describe, expect, it } from "vitest";
import { clientSchema } from "./client";

describe("clientSchema", () => {
  it("requires a name", () => {
    const result = clientSchema.safeParse({ name: "  ", email: "a@b.com" });
    expect(result.success).toBe(false);
  });

  it("requires a valid email", () => {
    const result = clientSchema.safeParse({ name: "Rohit Sharma", email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("trims text fields and lowercases the email", () => {
    const result = clientSchema.safeParse({
      name: "  Rohit Sharma  ",
      email: "  ROHIT@Example.com  ",
      company: "  DesignTech  ",
      phone: "  +91 98200 11223  ",
      notes: "  VIP client  ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      name: "Rohit Sharma",
      email: "rohit@example.com",
      company: "DesignTech",
      phone: "+91 98200 11223",
      notes: "VIP client",
    });
  });

  it("treats company, phone, and notes as optional", () => {
    const result = clientSchema.safeParse({ name: "Rohit Sharma", email: "rohit@example.com" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.company).toBeUndefined();
    expect(result.data.phone).toBeUndefined();
    expect(result.data.notes).toBeUndefined();
  });

  it("rejects a name longer than the maximum length", () => {
    const result = clientSchema.safeParse({ name: "a".repeat(121), email: "rohit@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects notes longer than the maximum length", () => {
    const result = clientSchema.safeParse({
      name: "Rohit Sharma",
      email: "rohit@example.com",
      notes: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
