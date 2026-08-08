import { describe, expect, it } from "vitest";
import { assertWorkspaceTransition, canTransitionWorkspace, InvalidStatusTransitionError } from "./workspace-transitions";

describe("PAYMENT_REQUIRED transitions — permitted", () => {
  it.each([
    ["DRAFT", "IN_REVIEW"],
    ["IN_REVIEW", "CHANGES_REQUESTED"],
    ["CHANGES_REQUESTED", "IN_REVIEW"],
    ["IN_REVIEW", "APPROVED"],
    ["APPROVED", "PAYMENT_PENDING"],
    ["PAYMENT_PENDING", "AWAITING_CREATOR_RELEASE"],
    ["AWAITING_CREATOR_RELEASE", "FILES_UNLOCKED"],
    ["FILES_UNLOCKED", "DELIVERED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to, "PAYMENT_REQUIRED")).toBe(true);
    expect(() => assertWorkspaceTransition(from, to, "PAYMENT_REQUIRED")).not.toThrow();
  });
});

describe("PAYMENT_REQUIRED transitions — forbidden", () => {
  it.each([
    ["CANCELLED", "IN_REVIEW"],
    ["APPROVED", "CHANGES_REQUESTED"],
    ["APPROVED", "DRAFT"],
    ["DELIVERED", "IN_REVIEW"],
    ["DRAFT", "APPROVED"],
    ["CHANGES_REQUESTED", "APPROVED"],
    // Never allowed to skip verification/delivery steps.
    ["APPROVED", "PAID"],
    ["PAYMENT_PENDING", "FILES_UNLOCKED"],
    ["PAID", "DELIVERED"],
    ["IN_REVIEW", "PAID"],
    // Approval-only / preview-only-only states never reachable here.
    ["IN_REVIEW", "CLOSED"],
  ] as const)("forbids %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to, "PAYMENT_REQUIRED")).toBe(false);
    expect(() => assertWorkspaceTransition(from, to, "PAYMENT_REQUIRED")).toThrow(InvalidStatusTransitionError);
  });
});

describe("PAYMENT_REQUIRED — cancellation reachable except when financially locked", () => {
  it.each(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PAYMENT_PENDING"] as const)(
    "allows %s -> CANCELLED",
    (from) => {
      expect(canTransitionWorkspace(from, "CANCELLED", "PAYMENT_REQUIRED")).toBe(true);
    },
  );

  it.each(["PAID", "AWAITING_CREATOR_RELEASE", "FILES_UNLOCKED", "DELIVERED", "CANCELLED"] as const)(
    "forbids %s -> CANCELLED (financially locked — never rolled back)",
    (from) => {
      expect(canTransitionWorkspace(from, "CANCELLED", "PAYMENT_REQUIRED")).toBe(false);
    },
  );
});

describe("PAYMENT_REQUIRED — DELIVERED is terminal", () => {
  it("permits nothing out of DELIVERED", () => {
    expect(canTransitionWorkspace("DELIVERED", "CANCELLED", "PAYMENT_REQUIRED")).toBe(false);
    expect(canTransitionWorkspace("DELIVERED", "PAID", "PAYMENT_REQUIRED")).toBe(false);
    expect(canTransitionWorkspace("DELIVERED", "IN_REVIEW", "PAYMENT_REQUIRED")).toBe(false);
  });
});

describe("APPROVAL_ONLY transitions — no payment states ever reachable", () => {
  it.each([
    ["DRAFT", "IN_REVIEW"],
    ["IN_REVIEW", "APPROVED"],
    ["APPROVED", "AWAITING_CREATOR_RELEASE"],
    ["AWAITING_CREATOR_RELEASE", "FILES_UNLOCKED"],
    ["FILES_UNLOCKED", "DELIVERED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to, "APPROVAL_ONLY")).toBe(true);
  });

  it.each([
    ["APPROVED", "PAYMENT_PENDING"],
    ["APPROVED", "PAID"],
    ["AWAITING_CREATOR_RELEASE", "PAID"],
    ["IN_REVIEW", "PAYMENT_PENDING"],
  ] as const)("forbids %s -> %s (no payment in this mode)", (from, to) => {
    expect(canTransitionWorkspace(from, to, "APPROVAL_ONLY")).toBe(false);
    expect(() => assertWorkspaceTransition(from, to, "APPROVAL_ONLY")).toThrow(InvalidStatusTransitionError);
  });

  it("allows cancellation up to AWAITING_CREATOR_RELEASE but not after files unlock", () => {
    expect(canTransitionWorkspace("AWAITING_CREATOR_RELEASE", "CANCELLED", "APPROVAL_ONLY")).toBe(true);
    expect(canTransitionWorkspace("FILES_UNLOCKED", "CANCELLED", "APPROVAL_ONLY")).toBe(false);
    expect(canTransitionWorkspace("DELIVERED", "CANCELLED", "APPROVAL_ONLY")).toBe(false);
  });
});

describe("PREVIEW_ONLY transitions — never approves, pays, or unlocks files", () => {
  it.each([
    ["DRAFT", "IN_REVIEW"],
    ["IN_REVIEW", "CHANGES_REQUESTED"],
    ["CHANGES_REQUESTED", "IN_REVIEW"],
    ["IN_REVIEW", "CLOSED"],
    ["CHANGES_REQUESTED", "CLOSED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to, "PREVIEW_ONLY")).toBe(true);
  });

  it.each([
    ["IN_REVIEW", "APPROVED"],
    ["CHANGES_REQUESTED", "APPROVED"],
    ["IN_REVIEW", "PAYMENT_PENDING"],
    ["IN_REVIEW", "FILES_UNLOCKED"],
    ["CLOSED", "IN_REVIEW"],
  ] as const)("forbids %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to, "PREVIEW_ONLY")).toBe(false);
    expect(() => assertWorkspaceTransition(from, to, "PREVIEW_ONLY")).toThrow(InvalidStatusTransitionError);
  });

  it("CLOSED is terminal", () => {
    expect(canTransitionWorkspace("CLOSED", "IN_REVIEW", "PREVIEW_ONLY")).toBe(false);
    expect(canTransitionWorkspace("CLOSED", "CANCELLED", "PREVIEW_ONLY")).toBe(false);
  });
});
