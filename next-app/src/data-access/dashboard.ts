import "server-only";
import { computeDerivedProgress } from "@/lib/status-labels";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { toDisplayNumber, toDisplayNumberOrNull } from "@/lib/decimal";
import { computeDashboardSummaryFromWorkspaces, type DashboardSummary } from "@/lib/dashboard-summary";
import { formatActivityLabel } from "@/lib/activity-log";
import type { WorkspaceListItem } from "./workspaces";

export type { DashboardSummary };

/** Reuses the same shape as the /workspaces list so WorkspaceTable/WorkspaceCard need no dashboard-specific variant. */
export type DashboardWorkspace = WorkspaceListItem;


export interface DashboardPaymentEntry {
  id: string;
  workspaceTitle: string;
  clientName: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  recentWorkspaces: DashboardWorkspace[];
}

const RECENT_WORKSPACE_COUNT = 4;

/**
 * Every figure here is computed (via computeDashboardSummaryFromWorkspaces,
 * see src/lib/dashboard-summary.ts) from the authenticated creator's own
 * workspace/payment/activity rows — nothing is hardcoded, and every query
 * is scoped by `creatorId` (never trusted from anywhere else).
 */
export async function getDashboardData(): Promise<DashboardData> {
  const creator = await requireAuthenticatedUser();
  const creatorId = creator.id;

  const [allWorkspaces, recentWorkspaces] = await Promise.all([
    prisma.workspace.findMany({ where: { creatorId }, select: { amount: true, status: true } }),
    prisma.workspace.findMany({
      where: { creatorId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: RECENT_WORKSPACE_COUNT,
      include: {
        reviewLinks: {
          where: {
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { id: true },
          take: 1,
        },
        files: { select: { status: true } },
      },
    }),
  ]);

  return {
    summary: computeDashboardSummaryFromWorkspaces(allWorkspaces),
    recentWorkspaces: recentWorkspaces.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description,
      currency: w.currency,
      amount: toDisplayNumberOrNull(w.amount),
      status: w.status,
      progress: w.progress,
      hasActiveReviewLink: w.reviewLinks.length > 0,
      updatedAt: w.updatedAt.toISOString(),
      clientName: w.clientName,
      deliveryMode: w.deliveryMode,
      derivedProgress: computeDerivedProgress(w.status, w.files),
    })),
  };
}
