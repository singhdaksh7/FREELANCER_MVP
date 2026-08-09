import { describe, expect, it } from "vitest";
import { unpreviewableFileLockedMessage } from "./preview-lock-copy";

describe("unpreviewableFileLockedMessage", () => {
  it("APPROVAL_ONLY copy never mentions payment", () => {
    const message = unpreviewableFileLockedMessage("APPROVAL_ONLY");
    expect(message).toBe(
      "Preview is not available for this file type. The original remains protected until approval is confirmed.",
    );
    expect(message.toLowerCase()).not.toContain("payment");
  });

  it("PAYMENT_REQUIRED copy explicitly mentions payment", () => {
    const message = unpreviewableFileLockedMessage("PAYMENT_REQUIRED");
    expect(message).toBe(
      "Preview is not available for this file type. The original remains protected until approval and payment are confirmed.",
    );
    expect(message.toLowerCase()).toContain("payment");
  });

  it("never uses the old, mode-blind 'locked deliverable pending payment' copy", () => {
    for (const mode of ["APPROVAL_ONLY", "PAYMENT_REQUIRED", "PREVIEW_ONLY"]) {
      expect(unpreviewableFileLockedMessage(mode)).not.toContain("locked deliverable pending payment");
    }
  });
});
