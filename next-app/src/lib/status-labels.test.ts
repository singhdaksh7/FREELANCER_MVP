import { describe, expect, it } from "vitest";
import { computeDerivedProgress } from "./status-labels";

describe("computeDerivedProgress", () => {
  it("returns 'File processing issue' if any file has FAILED status", () => {
    expect(computeDerivedProgress("DRAFT", [{ status: "READY" }, { status: "FAILED" }])).toBe("File processing issue");
  });

  it("returns 'Preparing files' for DRAFT with UPLOADING files", () => {
    expect(computeDerivedProgress("DRAFT", [{ status: "UPLOADING" }])).toBe("Preparing files");
  });

  it("returns 'Ready to share' for DRAFT with only READY files", () => {
    expect(computeDerivedProgress("DRAFT", [{ status: "READY" }])).toBe("Ready to share");
  });

  it("returns 'Waiting for client' for IN_REVIEW", () => {
    expect(computeDerivedProgress("IN_REVIEW", [{ status: "READY" }])).toBe("Waiting for client");
  });
});
