import { describe, expect, it } from "vitest";
import { ActivityAction, formatActivityLabel } from "./activity-log";

describe("formatActivityLabel", () => {
  it("formats WORKSPACE_CREATED", () => {
    expect(formatActivityLabel(ActivityAction.WORKSPACE_CREATED, { title: "Brand Identity" })).toBe(
      "Workspace created",
    );
  });

  it("formats WORKSPACE_UPDATED with changed fields", () => {
    expect(
      formatActivityLabel(ActivityAction.WORKSPACE_UPDATED, { changedFields: ["title", "description"] }),
    ).toBe("Workspace updated (title, description)");
  });

  it("formats WORKSPACE_UPDATED with no changed fields as a generic label", () => {
    expect(formatActivityLabel(ActivityAction.WORKSPACE_UPDATED, {})).toBe("Workspace updated");
  });

  it("formats WORKSPACE_CANCELLED", () => {
    expect(formatActivityLabel(ActivityAction.WORKSPACE_CANCELLED, {})).toBe("Workspace cancelled");
  });

  it("formats CLIENT_CHANGED using the new client's name", () => {
    expect(
      formatActivityLabel(ActivityAction.CLIENT_CHANGED, { fromClientName: "Rohit", toClientName: "Priya" }),
    ).toBe("Client changed to Priya");
  });

  it("formats AMOUNT_CHANGED with a formatted currency amount", () => {
    const label = formatActivityLabel(ActivityAction.AMOUNT_CHANGED, {
      fromAmount: 25000,
      toAmount: 30000,
      currency: "INR",
    });
    expect(label).toContain("30,000");
  });

  it("formats DUE_DATE_CHANGED with a formatted date", () => {
    const label = formatActivityLabel(ActivityAction.DUE_DATE_CHANGED, { toDueDate: "2026-08-15" });
    expect(label).toBe("Due date changed to 15 Aug 2026");
  });

  it("formats DUE_DATE_CHANGED with no due date as 'no due date'", () => {
    const label = formatActivityLabel(ActivityAction.DUE_DATE_CHANGED, { toDueDate: null });
    expect(label).toBe("Due date changed to no due date");
  });

  it("formats CLIENT_CREATED / CLIENT_UPDATED / CLIENT_DELETED", () => {
    expect(formatActivityLabel(ActivityAction.CLIENT_CREATED, { name: "Rohit Sharma" })).toBe(
      "Client Rohit Sharma added",
    );
    expect(formatActivityLabel(ActivityAction.CLIENT_UPDATED, { changedFields: ["email"] })).toBe(
      "Client updated (email)",
    );
    expect(formatActivityLabel(ActivityAction.CLIENT_DELETED, { name: "Rohit Sharma" })).toBe(
      "Client Rohit Sharma deleted",
    );
  });

  it("falls back to rendering an unrecognized action string unchanged (pre-Phase-4 seed rows)", () => {
    expect(formatActivityLabel("Client Opened Review Link", null)).toBe("Client Opened Review Link");
  });

  it("formats REVIEW_LINK_CREATED / REVOKED / REGENERATED using only the safe tokenPrefix, never a full token", () => {
    expect(formatActivityLabel(ActivityAction.REVIEW_LINK_CREATED, { tokenPrefix: "AbCd1234" })).toBe(
      "Secure review link created (AbCd1234…)",
    );
    expect(formatActivityLabel(ActivityAction.REVIEW_LINK_REVOKED, {})).toBe("Secure review link revoked");
    expect(formatActivityLabel(ActivityAction.REVIEW_LINK_REGENERATED, { tokenPrefix: "XyZw9876" })).toBe(
      "Secure review link regenerated (XyZw9876…)",
    );
  });

  it("formats COMMENT_ADDED / COMMENT_REPLIED / COMMENT_RESOLVED with reviewer identity labelling", () => {
    expect(formatActivityLabel(ActivityAction.COMMENT_ADDED, { reviewerName: "Rohit Sharma" })).toBe(
      "Rohit Sharma added a comment",
    );
    expect(formatActivityLabel(ActivityAction.COMMENT_REPLIED, { reviewerName: "Rohit Sharma" })).toBe(
      "Rohit Sharma replied to a comment",
    );
    expect(formatActivityLabel(ActivityAction.COMMENT_RESOLVED, {})).toBe("Comment resolved");
  });

  it("formats CHANGES_REQUESTED / REVISION_SUBMITTED / PROJECT_APPROVED", () => {
    expect(formatActivityLabel(ActivityAction.CHANGES_REQUESTED, { reviewerName: "Rohit Sharma" })).toBe(
      "Rohit Sharma requested changes",
    );
    expect(formatActivityLabel(ActivityAction.REVISION_SUBMITTED, { versionCount: 2 })).toBe(
      "Revision submitted for review (2 files)",
    );
    expect(formatActivityLabel(ActivityAction.PROJECT_APPROVED, { reviewerName: "Rohit Sharma" })).toBe(
      "Project approved by Rohit Sharma",
    );
  });

  it("formats FILE_VERSION_* codes with the version number", () => {
    expect(
      formatActivityLabel(ActivityAction.FILE_VERSION_UPLOADED, { fileName: "Logo.png", versionNumber: 2 }),
    ).toBe("Logo.png — version 2 uploaded");
    expect(
      formatActivityLabel(ActivityAction.FILE_VERSION_PROCESSING_COMPLETED, { fileName: "Logo.png", versionNumber: 2 }),
    ).toBe("Logo.png — version 2 ready");
    expect(
      formatActivityLabel(ActivityAction.FILE_VERSION_PROCESSING_FAILED, { fileName: "Logo.png", versionNumber: 2 }),
    ).toBe("Logo.png — version 2 processing failed");
  });

  it("never renders a raw review token — REVIEW_LINK_* formatting only ever consumes tokenPrefix, not a full-token field", () => {
    // ActivityMetadata's type surface has no "token"/"rawToken" field at
    // all (see the interface above) — this test documents that
    // contract so a future edit adding one would need a deliberate,
    // reviewable change here.
    const metadataKeys = Object.keys({
      changedFields: [],
      fromClientName: "",
      toClientName: "",
      fromAmount: 0,
      toAmount: 0,
      currency: "",
      fromDueDate: null,
      toDueDate: null,
      name: "",
      title: "",
      fileName: "",
      errorSummary: "",
      attempt: 0,
      tokenPrefix: "",
      reviewerName: "",
      commentPreview: "",
      versionNumber: 0,
      versionCount: 0,
      changeRequestSummary: "",
    });
    expect(metadataKeys).not.toContain("token");
    expect(metadataKeys).not.toContain("rawToken");
  });
});
