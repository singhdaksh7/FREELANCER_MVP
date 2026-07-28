import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { toDisplayNumber } from "@/lib/decimal";
import { computeDashboardSummaryFromWorkspaces, type DashboardSummary } from "@/lib/dashboard-summary";
import { formatActivityLabel } from "@/lib/activity-log";
import type { WorkspaceListItem } from "./workspaces";

export type { DashboardSummary };

/** Reuses the same shape as the /workspaces list so WorkspaceTable/WorkspaceCard need no dashboard-specific variant. */
export type DashboardWorkspace = WorkspaceListItem;

export interface DashboardActivityEntry {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  workspaceId: string;
  workspaceTitle: string;
}

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
  recentActivity: DashboardActivityEntry[];
  recentPayments: DashboardPaymentEntry[];
}

const RECENT_WORKSPACE_COUNT = 4;
const RECENT_ACTIVITY_COUNT = 5;
const RECENT_PAYMENT_COUNT = 3;

/**
 * Every figure here is computed (via computeDashboardSummaryFromWorkspaces,
 * see src/lib/dashboard-summary.ts) from the authenticated creator's own
 * workspace/payment/activity rows — nothing is hardcoded, and every query
 * is scoped by `creatorId` (never trusted from anywhere else).
 */
export async function getDashboardData(): Promise<DashboardData> {
  const creator = await requireAuthenticatedUser();
  const creatorId = creator.id;

  const [allWorkspaces, recentWorkspaces, recentActivity, recentPayments] = await Promise.all([
    prisma.workspace.findMany({ where: { creatorId }, select: { amount: true, status: true } }),
    prisma.workspace.findMany({
      where: { creatorId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: RECENT_WORKSPACE_COUNT,
      include: {
        client: { select: { id: true, name: true, company: true } },
        reviewLinks: { where: { status: "ACTIVE", expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
      },
    }),
    prisma.activityLog.findMany({
      where: { workspace: { creatorId } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: RECENT_ACTIVITY_COUNT,
      include: { workspace: { select: { id: true, title: true } } },
    }),
    prisma.payment.findMany({
      where: { workspace: { creatorId } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: RECENT_PAYMENT_COUNT,
      include: { workspace: { select: { title: true, client: { select: { name: true } } } } },
    }),
  ]);

  return {
    summary: computeDashboardSummaryFromWorkspaces(allWorkspaces),
    recentWorkspaces: recentWorkspaces.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description,
      currency: w.currency,
      amount: toDisplayNumber(w.amount),
      status: w.status,
      progress: w.progress,
      hasActiveReviewLink: w.reviewLinks.length > 0,
      updatedAt: w.updatedAt.toISOString(),
      client: w.client,
    })),
    recentActivity: recentActivity.map((entry) => ({
      id: entry.id,
      action: formatActivityLabel(entry.action, entry.metadata),
      actorName: entry.actorName,
      createdAt: entry.createdAt.toISOString(),
      // The query below filters `where: { workspace: { creatorId } }`,
      // which excludes rows with a null workspaceId (client-level activity
      // added in Phase 4) — so `workspace` is always present here, even
      // though the relation itself is optional on the model now.
      workspaceId: entry.workspace!.id,
      workspaceTitle: entry.workspace!.title,
    })),
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      workspaceTitle: payment.workspace.title,
      clientName: payment.workspace.client.name,
      amount: toDisplayNumber(payment.amount),
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}
