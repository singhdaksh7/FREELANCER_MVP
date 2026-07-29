import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "./auth";
import { ActivityAction } from "@/lib/activity-log";
import { getPayoutProvider } from "@/payouts/payout-provider";
import type { WorkspaceStatus, SupportTicketStatus, DeliveryMode, PaymentStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

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

// ---------------------------------------------------------------------------
// Minimal admin browsing — /admin/users, /admin/workspaces, /admin/payments.
// All three are read-only: no function here (or anywhere in the app) lets an
// admin mutate a User/Workspace/Payment row. See ADMIN_ARCHITECTURE.md.
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceCount: number;
  capturedPaymentSubunits: bigint;
  pendingPayableSubunits: bigint;
  currency: string;
  createdAt: string;
}

/** Paginated, searchable creator directory. Never selects `passwordHash`. */
export async function getAdminUsers(page: number, pageSize: number, q: string): Promise<{ rows: AdminUserRow[]; total: number }> {
  await requireAdminRole();
  const skip = Math.max(0, (page - 1) * pageSize);

  const where: Prisma.UserWhereInput = {
    role: "CREATOR",
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { workspaces: true } },
        balanceAccount: { select: { pendingSubunits: true, currency: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const capturedSums = await Promise.all(
    users.map((user) =>
      prisma.payment.aggregate({
        where: { status: "PAID", workspace: { creatorId: user.id } },
        _sum: { amountSubunits: true },
      }),
    ),
  );

  return {
    total,
    rows: users.map((user, index) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      workspaceCount: user._count.workspaces,
      capturedPaymentSubunits: capturedSums[index]._sum.amountSubunits ?? BigInt(0),
      pendingPayableSubunits: user.balanceAccount?.pendingSubunits ?? BigInt(0),
      currency: user.balanceAccount?.currency ?? "INR",
      createdAt: user.createdAt.toISOString(),
    })),
  };
}

export interface AdminWorkspaceFilters {
  q: string;
  status: string;
  deliveryMode: string;
}

export interface AdminWorkspaceRow {
  id: string;
  title: string;
  creatorName: string;
  clientName: string;
  deliveryMode: string;
  status: string;
  amount: number | null;
  currency: string;
  fileCount: number;
  reviewLinkStatus: string | null;
  reviewLinkExpiresAt: string | null;
  updatedAt: string;
}

/** Paginated, searchable/filterable workspace directory. Never selects `tokenHash`/storage keys. */
export async function getAdminWorkspaces(
  page: number,
  pageSize: number,
  filters: AdminWorkspaceFilters,
): Promise<{ rows: AdminWorkspaceRow[]; total: number }> {
  await requireAdminRole();
  const skip = Math.max(0, (page - 1) * pageSize);
  const { q, status, deliveryMode } = filters;

  const where: Prisma.WorkspaceWhereInput = {
    ...(status !== "All" ? { status: status as WorkspaceStatus } : {}),
    ...(deliveryMode !== "All" ? { deliveryMode: deliveryMode as DeliveryMode } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { creator: { name: { contains: q, mode: "insensitive" } } },
            { client: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [workspaces, total] = await Promise.all([
    prisma.workspace.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        deliveryMode: true,
        status: true,
        amount: true,
        currency: true,
        updatedAt: true,
        creator: { select: { name: true } },
        client: { select: { name: true } },
        _count: { select: { files: { where: { deletedAt: null } } } },
        reviewLinks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, expiresAt: true },
        },
      },
    }),
    prisma.workspace.count({ where }),
  ]);

  return {
    total,
    rows: workspaces.map((workspace) => ({
      id: workspace.id,
      title: workspace.title,
      creatorName: workspace.creator.name,
      clientName: workspace.client.name,
      deliveryMode: workspace.deliveryMode,
      status: workspace.status,
      amount: workspace.amount ? Number(workspace.amount) : null,
      currency: workspace.currency,
      fileCount: workspace._count.files,
      reviewLinkStatus: workspace.reviewLinks[0]?.status ?? null,
      reviewLinkExpiresAt: workspace.reviewLinks[0]?.expiresAt ? workspace.reviewLinks[0].expiresAt.toISOString() : null,
      updatedAt: workspace.updatedAt.toISOString(),
    })),
  };
}

export interface AdminPaymentFilters {
  q: string;
  status: string;
}

export interface AdminPaymentRow {
  id: string;
  workspaceId: string;
  workspaceTitle: string;
  creatorName: string;
  clientName: string;
  grossAmountSubunits: bigint;
  platformFeeSubunits: bigint | null;
  freelancerPayableSubunits: bigint | null;
  currency: string;
  gatewayStatus: string;
  deliveryStatus: string;
  createdAt: string;
  capturedAt: string | null;
}

const DELIVERED_WORKSPACE_STATUSES: WorkspaceStatus[] = ["DELIVERED"];
const UNLOCKED_WORKSPACE_STATUSES: WorkspaceStatus[] = ["FILES_UNLOCKED", "PAID"];

function derivePaymentDeliveryStatus(workspaceStatus: WorkspaceStatus): string {
  if (DELIVERED_WORKSPACE_STATUSES.includes(workspaceStatus)) return "Delivered";
  if (UNLOCKED_WORKSPACE_STATUSES.includes(workspaceStatus)) return "Unlocked";
  return "Pending";
}

/** Paginated, searchable/filterable payment ledger. Never selects gateway/webhook secrets or raw payloads. */
export async function getAdminPayments(
  page: number,
  pageSize: number,
  filters: AdminPaymentFilters,
): Promise<{ rows: AdminPaymentRow[]; total: number }> {
  await requireAdminRole();
  const skip = Math.max(0, (page - 1) * pageSize);
  const { q, status } = filters;

  const where: Prisma.PaymentWhereInput = {
    ...(status !== "All" ? { status: status as PaymentStatus } : {}),
    ...(q
      ? {
          OR: [
            { workspace: { title: { contains: q, mode: "insensitive" } } },
            { workspace: { creator: { name: { contains: q, mode: "insensitive" } } } },
            { workspace: { client: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        amountSubunits: true,
        currency: true,
        status: true,
        createdAt: true,
        capturedAt: true,
        workspace: {
          select: {
            id: true,
            title: true,
            status: true,
            creator: { select: { name: true } },
            client: { select: { name: true } },
          },
        },
        breakdown: { select: { platformFeeSubunits: true, freelancerPayableSubunits: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    total,
    rows: payments.map((payment) => ({
      id: payment.id,
      workspaceId: payment.workspace.id,
      workspaceTitle: payment.workspace.title,
      creatorName: payment.workspace.creator.name,
      clientName: payment.workspace.client.name,
      grossAmountSubunits: payment.amountSubunits,
      platformFeeSubunits: payment.breakdown?.platformFeeSubunits ?? null,
      freelancerPayableSubunits: payment.breakdown?.freelancerPayableSubunits ?? null,
      currency: payment.currency,
      gatewayStatus: payment.status,
      deliveryStatus: derivePaymentDeliveryStatus(payment.workspace.status),
      createdAt: payment.createdAt.toISOString(),
      capturedAt: payment.capturedAt ? payment.capturedAt.toISOString() : null,
    })),
  };
}
