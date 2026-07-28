import { describe, expect, it } from "vitest";
import { workspaceCreateSchema } from "./workspace";

const VALID = {
  title: "Brand Identity Design",
  clientId: "cli_rohit",
  description: "Logo + guidelines",
  currency: "INR",
  amount: "25000",
  dueDate: "2026-08-15",
  watermarkText: "PREVIEW",
};

describe("workspaceCreateSchema", () => {
  it("accepts a fully valid payload", () => {
    const result = workspaceCreateSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("requires a title", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, title: "  " });
    expect(result.success).toBe(false);
  });

  it("requires a client to be selected", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, clientId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a zero amount", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, amount: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, amount: "-500" });
    expect(result.success).toBe(false);
  });

  it("rejects an amount with more than 2 decimal places", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, amount: "25000.999" });
    expect(result.success).toBe(false);
  });

  it("accepts an amount with exactly 2 decimal places", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, amount: "25000.50" });
    expect(result.success).toBe(true);
  });

  it("rejects an amount that isn't numeric", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, amount: "twenty-five-thousand" });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported currency", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, currency: "JPY" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid due date string", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, dueDate: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("treats due date, description, and watermark text as optional", () => {
    const result = workspaceCreateSchema.safeParse({
      title: "Untitled Project",
      clientId: "cli_rohit",
      currency: "INR",
      amount: "1000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a description longer than the maximum length", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, description: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects watermark text longer than the maximum length", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, watermarkText: "a".repeat(201) });
    expect(result.success).toBe(false);
  });
});
