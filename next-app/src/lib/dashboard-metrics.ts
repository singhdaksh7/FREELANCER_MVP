import type { ActivityLogEntry, Workspace } from "@/types";

export interface DashboardSummary {
  /** Sum of amounts for workspaces not yet paid. */
  outstandingAmount: number;
  /** Sum of amounts for workspaces already paid. */
  receivedRevenue: number;
  totalWorkspaceCount: number;
  /** Workspaces not yet paid — matches the original dashboard greeting copy. */
  activeWorkspaceCount: number;
  awaitingReviewCount: number;
  changesRequestedCount: number;
  /** Approved (awaiting payment) + explicitly Payment Pending. */
  paymentPendingCount: number;
}

/** All figures are derived from workspace mock records — nothing is hardcoded in the UI. */
export function computeDashboardSummary(workspaces: Workspace[]): DashboardSummary {
  const paid = workspaces.filter((w) => w.status === "Paid");
  const unpaid = workspaces.filter((w) => w.status !== "Paid");

  return {
    outstandingAmount: unpaid.reduce((sum, w) => sum + w.amount, 0),
    receivedRevenue: paid.reduce((sum, w) => sum + w.amount, 0),
    totalWorkspaceCount: workspaces.length,
    activeWorkspaceCount: unpaid.length,
    awaitingReviewCount: workspaces.filter((w) => w.status === "In Review").length,
    changesRequestedCount: workspaces.filter((w) => w.status === "Changes Requested").length,
    paymentPendingCount: workspaces.filter(
      (w) => w.status === "Approved" || w.status === "Payment Pending",
    ).length,
  };
}

export interface RecentActivityEntry extends ActivityLogEntry {
  workspaceId: string;
  workspaceTitle: string;
}

/**
 * Most-recently-updated workspaces' latest activity-log entry, newest
 * first. Reads existing per-workspace activity logs only — never
 * fabricates new activity.
 */
export function getRecentActivity(workspaces: Workspace[], limit = 5): RecentActivityEntry[] {
  return [...workspaces]
    .filter((w) => w.activityLog.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((w) => {
      const latest = w.activityLog[w.activityLog.length - 1];
      return {
        id: latest.id,
        action: latest.action,
        user: latest.user,
        timestamp: latest.timestamp,
        workspaceId: w.id,
        workspaceTitle: w.title,
      };
    });
}
