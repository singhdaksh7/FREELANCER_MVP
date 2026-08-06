import { describe, expect, it } from "vitest";
import { DELIVERY_MODES, workspaceCreateSchema } from "./workspace";

const VALID = {
  title: "Brand Identity Design",
  clientName: "Rohit Sharma",
  description: "Logo + guidelines",
  deliveryMode: "PAYMENT_REQUIRED",
  currency: "INR",
  amount: "25000",
  dueDate: "2026-08-15",
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

  it("requires a client name", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, clientName: "" });
    expect(result.success).toBe(false);
  });

  it("requires a client name that isn't only whitespace", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, clientName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a client name longer than the maximum length", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, clientName: "a".repeat(201) });
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

  it("treats due date and description as optional", () => {
    const result = workspaceCreateSchema.safeParse({
      title: "Untitled Project",
      clientName: "Rohit Sharma",
      deliveryMode: "PAYMENT_REQUIRED",
      currency: "INR",
      amount: "1000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a description longer than the maximum length", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, description: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });



  it("rejects an unrecognized delivery mode", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, deliveryMode: "ESCROW" });
    expect(result.success).toBe(false);
  });

  it("only exposes PAYMENT_REQUIRED and APPROVAL_ONLY as selectable delivery modes", () => {
    expect(DELIVERY_MODES).toEqual(["PAYMENT_REQUIRED", "APPROVAL_ONLY"]);
  });

  it("rejects the retired PREVIEW_ONLY delivery mode", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, deliveryMode: "PREVIEW_ONLY" });
    expect(result.success).toBe(false);
  });
});

describe("workspaceCreateSchema — delivery-mode-conditional amount validation", () => {
  it("requires an amount for PAYMENT_REQUIRED", () => {
    const withoutAmount: Partial<typeof VALID> = { ...VALID };
    delete withoutAmount.amount;
    const result = workspaceCreateSchema.safeParse({ ...withoutAmount, deliveryMode: "PAYMENT_REQUIRED" });
    expect(result.success).toBe(false);
  });

  it("allows APPROVAL_ONLY with no amount", () => {
    const withoutAmount: Partial<typeof VALID> = { ...VALID };
    delete withoutAmount.amount;
    const result = workspaceCreateSchema.safeParse({ ...withoutAmount, deliveryMode: "APPROVAL_ONLY" });
    expect(result.success).toBe(true);
  });

  it("allows APPROVAL_ONLY with an amount (for the creator's own reference)", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, deliveryMode: "APPROVAL_ONLY", amount: "5000" });
    expect(result.success).toBe(true);
  });

  it("still rejects a malformed amount for APPROVAL_ONLY when one is submitted", () => {
    const result = workspaceCreateSchema.safeParse({ ...VALID, deliveryMode: "APPROVAL_ONLY", amount: "not-a-number" });
    expect(result.success).toBe(false);
  });
});
