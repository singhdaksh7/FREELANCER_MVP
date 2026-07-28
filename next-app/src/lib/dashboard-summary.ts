import { sumDecimals, toDisplayNumber, type DecimalLike } from "@/lib/decimal";
import { WorkspaceStatus } from "@/generated/prisma/enums";

const TERMINAL_PAID_STATUSES = [
  WorkspaceStatus.PAID,
  WorkspaceStatus.FILES_UNLOCKED,
  WorkspaceStatus.DELIVERED,
] as const;

export interface DashboardSummary {
  outstandingAmount: number;
  receivedRevenue: number;
  totalWorkspaceCount: number;
  activeWorkspaceCount: number;
  awaitingReviewCount: number;
  changesRequestedCount: number;
  paymentPendingCount: number;
}

export interface DashboardWorkspaceRecord {
  amount: DecimalLike;
  status: string;
}

/**
 * Pure summary calculation over database-shaped workspace rows (`amount`
 * as a Decimal-like value, `status` as the raw WorkspaceStatus string).
 * No `server-only` import (unlike src/data-access/*) specifically so it
 * can be unit tested directly with plain fixture objects — no database,
 * no Next.js request context required.
 */
export function computeDashboardSummaryFromWorkspaces(
  workspaces: DashboardWorkspaceRecord[],
): DashboardSummary {
  const paid = workspaces.filter((w) =>
    TERMINAL_PAID_STATUSES.includes(w.status as (typeof TERMINAL_PAID_STATUSES)[number]),
  );
  const unpaid = workspaces.filter(
    (w) => !TERMINAL_PAID_STATUSES.includes(w.status as (typeof TERMINAL_PAID_STATUSES)[number]),
  );

  return {
    outstandingAmount: toDisplayNumber(sumDecimals(unpaid.map((w) => w.amount))),
    receivedRevenue: toDisplayNumber(sumDecimals(paid.map((w) => w.amount))),
    totalWorkspaceCount: workspaces.length,
    activeWorkspaceCount: unpaid.length,
    awaitingReviewCount: workspaces.filter((w) => w.status === WorkspaceStatus.IN_REVIEW).length,
    changesRequestedCount: workspaces.filter((w) => w.status === WorkspaceStatus.CHANGES_REQUESTED)
      .length,
    paymentPendingCount: workspaces.filter(
      (w) => w.status === WorkspaceStatus.APPROVED || w.status === WorkspaceStatus.PAYMENT_PENDING,
    ).length,
  };
}
