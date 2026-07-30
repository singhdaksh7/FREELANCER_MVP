import { describe, expect, it } from "vitest";
import { computeDashboardSummary, getRecentActivity } from "./dashboard-metrics";
import type { Workspace } from "@/types";

function makeWorkspace(overrides: Partial<Workspace>): Workspace {
  return {
    id: "ws_x",
    title: "Test Workspace",
    secureToken: "tok",
    client: { id: "cli_x", name: "Client X", company: "Company X" },
    category: "Web Design",
    description: "",
    amount: 1000,
    status: "In Review",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    watermarkText: "",
    currentVersion: "v1",
    versions: ["v1"],
    files: [],
    comments: [],
    activityLog: [],
    ...overrides,
  };
}

describe("computeDashboardSummary", () => {
  it("splits outstanding vs received revenue by paid status", () => {
    const workspaces = [
      makeWorkspace({ id: "a", amount: 1000, status: "In Review" }),
      makeWorkspace({ id: "b", amount: 2000, status: "Paid" }),
    ];

    const summary = computeDashboardSummary(workspaces);

    expect(summary.outstandingAmount).toBe(1000);
    expect(summary.receivedRevenue).toBe(2000);
    expect(summary.totalWorkspaceCount).toBe(2);
    expect(summary.activeWorkspaceCount).toBe(1);
  });

  it("counts awaiting-review, changes-requested and payment-pending buckets independently", () => {
    const workspaces = [
      makeWorkspace({ id: "a", status: "In Review" }),
      makeWorkspace({ id: "b", status: "Changes Requested" }),
      makeWorkspace({ id: "c", status: "Approved" }),
      makeWorkspace({ id: "d", status: "Payment Pending" }),
    ];

    const summary = computeDashboardSummary(workspaces);

    expect(summary.awaitingReviewCount).toBe(1);
    expect(summary.changesRequestedCount).toBe(1);
    expect(summary.paymentPendingCount).toBe(2);
  });
});

describe("getRecentActivity", () => {
  it("returns each workspace's latest activity entry, most recently updated workspace first", () => {
    const workspaces = [
      makeWorkspace({
        id: "older",
        updatedAt: "2026-01-01",
        activityLog: [{ id: "1", action: "Created", user: "Arjun Raj", timestamp: "t1" }],
      }),
      makeWorkspace({
        id: "newer",
        updatedAt: "2026-02-01",
        activityLog: [
          { id: "2", action: "Created", user: "Arjun Raj", timestamp: "t2" },
          { id: "3", action: "Approved", user: "Client", timestamp: "t3" },
        ],
      }),
    ];

    const activity = getRecentActivity(workspaces, 5);

    expect(activity[0]).toMatchObject({ workspaceId: "newer", action: "Approved" });
    expect(activity[1]).toMatchObject({ workspaceId: "older", action: "Created" });
  });

  it("respects the limit", () => {
    const workspaces = [
      makeWorkspace({ id: "a", activityLog: [{ id: "1", action: "A", user: "U", timestamp: "t" }] }),
      makeWorkspace({ id: "b", activityLog: [{ id: "2", action: "B", user: "U", timestamp: "t" }] }),
      makeWorkspace({ id: "c", activityLog: [{ id: "3", action: "C", user: "U", timestamp: "t" }] }),
    ];

    expect(getRecentActivity(workspaces, 2)).toHaveLength(2);
  });
});
