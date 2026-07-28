import { describe, expect, it } from "vitest";
import { assertWorkspaceTransition, canTransitionWorkspace, InvalidStatusTransitionError } from "./workspace-transitions";

describe("workspace transition policy — permitted transitions", () => {
  it.each([
    ["DRAFT", "IN_REVIEW"],
    ["IN_REVIEW", "CHANGES_REQUESTED"],
    ["CHANGES_REQUESTED", "IN_REVIEW"],
    ["IN_REVIEW", "APPROVED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to)).toBe(true);
    expect(() => assertWorkspaceTransition(from, to)).not.toThrow();
  });
});

describe("workspace transition policy — forbidden transitions", () => {
  it.each([
    ["CANCELLED", "IN_REVIEW"],
    ["APPROVED", "CHANGES_REQUESTED"],
    ["APPROVED", "DRAFT"],
    ["DELIVERED", "IN_REVIEW"],
    ["APPROVED", "PAYMENT_PENDING"],
    ["DRAFT", "APPROVED"],
    ["CHANGES_REQUESTED", "APPROVED"],
  ] as const)("forbids %s -> %s", (from, to) => {
    expect(canTransitionWorkspace(from, to)).toBe(false);
    expect(() => assertWorkspaceTransition(from, to)).toThrow(InvalidStatusTransitionError);
  });
});

describe("workspace transition policy — cancellation remains reachable except when financially locked", () => {
  it.each(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PAYMENT_PENDING"] as const)(
    "allows %s -> CANCELLED",
    (from) => {
      expect(canTransitionWorkspace(from, "CANCELLED")).toBe(true);
    },
  );

  it.each(["PAID", "FILES_UNLOCKED", "DELIVERED", "CANCELLED"] as const)(
    "forbids %s -> CANCELLED",
    (from) => {
      expect(canTransitionWorkspace(from, "CANCELLED")).toBe(false);
    },
  );
});

describe("Phase 7 transitions are not yet implemented", () => {
  it.each([
    ["APPROVED", "PAYMENT_PENDING"],
    ["PAYMENT_PENDING", "PAID"],
    ["PAID", "FILES_UNLOCKED"],
    ["FILES_UNLOCKED", "DELIVERED"],
  ] as const)("does not permit %s -> %s yet", (from, to) => {
    expect(canTransitionWorkspace(from, to)).toBe(false);
  });
});
