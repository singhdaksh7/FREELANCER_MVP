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
});
