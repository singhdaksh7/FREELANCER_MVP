import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "./auth";
import { ActivityAction } from "@/lib/activity-log";
import { getPayoutProvider } from "@/payouts/payout-provider";
import type { WorkspaceStatus, SupportTicketStatus } from "@/generated/prisma/enums";

const ACTIVE_WORKSPACE_STATUSES: WorkspaceStatus[] = [
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "FILES_UNLOCKED",
  "AWAITING_CREATOR_RELEASE",
];

const OPEN_TICKET_STATUSES: SupportTicketStatus[] = ["OPEN", "UNDER_REVIEW", "WAITING_FOR_CREATOR", "WAITING_FOR_CLIENT"];

export interface AdminDashboardStats {
  totalCreators: number;
  activeWorkspaces: number;
  paymentsCapturedCount: number;
  paymentsCapturedSubunits: bigint;
  platformFeeSubunits: bigint;
  pendingFreelancerPayableSubunits: bigint;
  openSupportTickets: number;
  fileProcessingFailures: number;
  currency: string;
}

/** Minimal, database-backed admin dashboard — see ADMIN_ARCHITECTURE.md. Every figure here is a direct query, never a manually-editable field. */
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  await requireAdminRole();

  const [
    totalCreators,
    activeWorkspaces,
    paymentsAgg,
    platformFeeAgg,
    pendingAgg,
    openSupportTickets,
    fileProcessingFailures,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "CREATOR" } }),
    prisma.workspace.count({ where: { status: { in: ACTIVE_WORKSPACE_STATUSES } } }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _count: true, _sum: { amountSubunits: true } }),
    prisma.payoutLedgerEntry.aggregate({ where: { type: "PLATFORM_FEE" }, _sum: { amountSubunits: true } }),
    prisma.payoutLedgerEntry.aggregate({
      where: { type: "PAYMENT_CREDIT", status: { in: ["PENDING", "AVAILABLE"] } },
      _sum: { amountSubunits: true },
    }),
    prisma.supportTicket.count({ where: { status: { in: OPEN_TICKET_STATUSES } } }),
    prisma.workspaceFile.count({ where: { status: "FAILED" } }),
  ]);

  return {
    totalCreators,
    activeWorkspaces,
    paymentsCapturedCount: paymentsAgg._count,
    paymentsCapturedSubunits: paymentsAgg._sum.amountSubunits ?? BigInt(0),
    platformFeeSubunits: platformFeeAgg._sum.amountSubunits ?? BigInt(0),
    pendingFreelancerPayableSubunits: pendingAgg._sum.amountSubunits ?? BigInt(0),
    openSupportTickets,
    fileProcessingFailures,
    currency: "INR",
  };
}

export interface AdminPayoutLedgerRow {
  id: string;
  creatorId: string;
  creatorName: string;
  type: string;
  amountSubunits: bigint;
  currency: string;
  status: string;
  availableAt: string | null;
  createdAt: string;
}

/** Paginated payout-ledger view for admin review — read-only; the only writes admins can trigger are the simulate* actions below. */
export async function getAdminPayoutLedger(page: number, pageSize = 25): Promise<{ rows: AdminPayoutLedgerRow[]; total: number }> {
  await requireAdminRole();
  const skip = Math.max(0, (page - 1) * pageSize);

  const [rows, total] = await Promise.all([
    prisma.payoutLedgerEntry.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: pageSize,
      include: { creator: { select: { name: true } } },
    }),
    prisma.payoutLedgerEntry.count(),
  ]);

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      creatorId: row.creatorId,
      creatorName: row.creator.name,
      type: row.type,
      amountSubunits: row.amountSubunits,
      currency: row.currency,
      status: row.status,
      availableAt: row.availableAt ? row.availableAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

const PAYOUT_ACTIVITY_BY_STEP = {
  markAvailable: { action: ActivityAction.PAYOUT_AVAILABLE, status: "AVAILABLE" },
  startPayout: { action: ActivityAction.PAYOUT_PROCESSING, status: "PROCESSING" },
  completePayout: { action: ActivityAction.PAYOUT_COMPLETED, status: "PAID" },
  failPayout: { action: ActivityAction.PAYOUT_FAILED, status: "FAILED" },
} as const;

/**
 * Admin-triggered test-mode payout simulation step — see
 * PLATFORM_FEE_AND_PAYOUT_LEDGER.md "Test-mode payout limitation." Routes
 * through the same PayoutProvider abstraction (production-guarded,
 * idempotent) that any future scheduled/automatic trigger would use —
 * this function only adds the ADMIN role requirement and its own audit
 * entry recording *which* admin simulated the step.
 */
export async function adminSimulatePayoutStep(
  entryId: string,
  step: "markAvailable" | "startPayout" | "completePayout" | "failPayout",
  reason?: string,
): Promise<void> {
  const admin = await requireAdminRole();
  const provider = await getPayoutProvider();

  if (step === "failPayout") {
    await provider.failPayout(entryId, reason ?? "Simulated failure (admin-triggered)");
  } else {
    await provider[step](entryId);
  }

  const entry = await prisma.payoutLedgerEntry.findUnique({ where: { id: entryId }, select: { creatorId: true } });
  const { action, status } = PAYOUT_ACTIVITY_BY_STEP[step];
  await prisma.activityLog.create({
    data: {
      action,
      actorType: "ADMIN",
      actorName: admin.name,
      creatorId: entry?.creatorId,
      metadata: { payoutStatus: status, simulatedBy: admin.email },
    },
  });
}
