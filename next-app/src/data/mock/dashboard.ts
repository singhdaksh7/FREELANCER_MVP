import { computeDashboardSummary, getRecentActivity } from "@/lib/dashboard-metrics";
import { WORKSPACES } from "./workspaces";

/**
 * Dashboard figures are derived from WORKSPACES, not hardcoded — see
 * src/lib/dashboard-metrics.ts for the calculations.
 */
export const DASHBOARD_SUMMARY = computeDashboardSummary(WORKSPACES);
export const RECENT_ACTIVITY = getRecentActivity(WORKSPACES, 5);
