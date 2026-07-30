import { describe, expect, it } from "vitest";
import { computeDashboardSummaryFromWorkspaces } from "./dashboard-summary";

describe("computeDashboardSummaryFromWorkspaces", () => {
  it("splits outstanding vs received revenue by terminal-paid status, using database-shaped records", () => {
    const summary = computeDashboardSummaryFromWorkspaces([
      { amount: "1000.00", status: "IN_REVIEW" },
      { amount: "2000.00", status: "PAID" },
      { amount: "500.00", status: "FILES_UNLOCKED" },
    ]);

    expect(summary.outstandingAmount).toBe(1000);
    expect(summary.receivedRevenue).toBe(2500);
    expect(summary.totalWorkspaceCount).toBe(3);
    expect(summary.activeWorkspaceCount).toBe(1);
  });

  it("counts awaiting-review, changes-requested and payment-pending buckets independently", () => {
    const summary = computeDashboardSummaryFromWorkspaces([
      { amount: 1000, status: "IN_REVIEW" },
      { amount: 1000, status: "CHANGES_REQUESTED" },
      { amount: 1000, status: "APPROVED" },
      { amount: 1000, status: "PAYMENT_PENDING" },
    ]);

    expect(summary.awaitingReviewCount).toBe(1);
    expect(summary.changesRequestedCount).toBe(1);
    expect(summary.paymentPendingCount).toBe(2);
  });

  it("sums Decimal-like amounts without floating-point drift", () => {
    const summary = computeDashboardSummaryFromWorkspaces([
      { amount: "0.10", status: "DRAFT" },
      { amount: "0.20", status: "DRAFT" },
    ]);

    // 0.1 + 0.2 === 0.30000000000000004 in native floating point.
    expect(summary.outstandingAmount).toBe(0.3);
  });

  it("returns zeros for an empty workspace list", () => {
    const summary = computeDashboardSummaryFromWorkspaces([]);
    expect(summary).toEqual({
      outstandingAmount: 0,
      receivedRevenue: 0,
      totalWorkspaceCount: 0,
      activeWorkspaceCount: 0,
      awaitingReviewCount: 0,
      changesRequestedCount: 0,
      paymentPendingCount: 0,
    });
  });
});
