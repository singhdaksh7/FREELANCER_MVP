import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction, formatActivityLabel } from "@/lib/activity-log";
import { toDecimal, toDisplayNumber, toDisplayNumberOrNull } from "@/lib/decimal";
import { parseEnumParam, parseQueryParam, type RawSearchParams } from "@/lib/search-params";
import type { WorkspaceCreateInput, WorkspaceUpdateInput } from "@/validation/workspace";
import { WorkspaceStatus, type Prisma } from "@/generated/prisma/client";
import { assertWorkspaceTransition, InvalidStatusTransitionError } from "@/lib/workspace-transitions";

export { InvalidStatusTransitionError };

export interface WorkspaceListItem {
  id: string;
  title: string;
  description: string | null;
  /** null for APPROVAL_ONLY/PREVIEW_ONLY workspaces that were never given a price. */
  amount: number | null;
  currency: string;
  status: string;
  progress: number;
  /** Whether an ACTIVE, unexpired ReviewLink currently exists — the raw token itself is never retrievable after creation, so this is a boolean indicator only, not a link. */
  hasActiveReviewLink: boolean;
  updatedAt: string;
  clientName: string;
}

const STATUS_FILTER_VALUES = ["All", ...Object.values(WorkspaceStatus)] as const;
const SORT_VALUES = ["recent", "title", "amount"] as const;
export type WorkspaceSort = (typeof SORT_VALUES)[number];

export interface WorkspaceFilters {
  q: string;
  status: (typeof STATUS_FILTER_VALUES)[number];
  sort: WorkspaceSort;
}

export interface WorkspacesResult {
  workspaces: WorkspaceListItem[];
  filters: WorkspaceFilters;
}

function mapWorkspace(
  workspace: Prisma.WorkspaceGetPayload<object>,
  activeReviewLinkWorkspaceIds: ReadonlySet<string>,
): WorkspaceListItem {
  return {
    id: workspace.id,
    title: workspace.title,
    description: workspace.description,
    amount: toDisplayNumberOrNull(workspace.amount),
    currency: workspace.currency,
    status: workspace.status,
    progress: workspace.progress,
    hasActiveReviewLink: activeReviewLinkWorkspaceIds.has(workspace.id),
    updatedAt: workspace.updatedAt.toISOString(),
    clientName: workspace.clientName,
  };
}

/**
 * Database-backed search/status/client/sort over the authenticated
 * creator's workspaces. `rawParams` comes straight from the page's URL
 * search params — every value is validated/normalized here before it
 * ever reaches a query, and the creator id always comes from the
 * session, never from `rawParams`.
 */
export async function getWorkspaces(rawParams: RawSearchParams): Promise<WorkspacesResult> {
  const creator = await requireAuthenticatedUser();

  const q = parseQueryParam(rawParams, "q");
  const status = parseEnumParam(rawParams, "status", STATUS_FILTER_VALUES, "All");
  const sort = parseEnumParam(rawParams, "sort", SORT_VALUES, "recent");

  const where: Prisma.WorkspaceWhereInput = {
    creatorId: creator.id,
    ...(status !== "All" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { clientName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.WorkspaceOrderByWithRelationInput[] =
    sort === "title"
      ? [{ title: "asc" }]
      : sort === "amount"
        ? [{ amount: "desc" }, { id: "asc" }]
        : [{ updatedAt: "desc" }, { id: "asc" }];

  const workspaces = await prisma.workspace.findMany({ where, orderBy });

  const activeReviewLinks = await prisma.reviewLink.findMany({
    where: { workspaceId: { in: workspaces.map((w) => w.id) }, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { workspaceId: true },
  });
  const activeReviewLinkWorkspaceIds = new Set(activeReviewLinks.map((link) => link.workspaceId));

  return {
    workspaces: workspaces.map((w) => mapWorkspace(w, activeReviewLinkWorkspaceIds)),
    filters: { q, status, sort },
  };
}

/** Statuses past which the workspace can no longer be cancelled, and (for the client field) can no longer be reassigned. */
export const FINANCIAL_LOCK_STATUSES = ["PAID", "FILES_UNLOCKED", "DELIVERED"] as const;

/**
 * Statuses past which amount/currency must never change. Once a workspace
 * is APPROVED, WorkspaceApproval has already frozen an immutable
 * approvedAmount/approvedCurrency snapshot (see approvals.ts) that payment
 * orders are created from — allowing Workspace.amount itself to keep
 * drifting after that point would be confusing even though it can no
 * longer affect what a client is actually charged. Locking here closes
 * that gap at the source instead of relying solely on the snapshot.
 */
export const AMOUNT_LOCK_STATUSES = [
  "APPROVED",
  "PAYMENT_PENDING",
  "PAID",
  "FILES_UNLOCKED",
  "DELIVERED",
  "AWAITING_CREATOR_RELEASE",
  "CLOSED",
] as const;

export interface WorkspacePaymentEntry {
  id: string;
  amount: number;
  currency: string;
  status: string;
  /** Safe to show a creator — never the key secret/webhook secret/signature. */
  gatewayOrderId: string | null;
  capturedAt: string | null;
  failureCode: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  delivery: {
    bundleStatus: string;
    processingError: string | null;
    downloadCount: number;
    maxDownloads: number;
    grantStatus: string | null;
    grantExpiresAt: string | null;
  } | null;
  /** Frozen at order-creation time — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md. Null only if this Payment predates Phase 7.5. */
  breakdown: {
    platformFeeBps: number;
    platformFeeAmount: number;
    freelancerPayableAmount: number;
  } | null;
}

export interface WorkspaceActivityEntry {
  id: string;
  label: string;
  actorName: string;
  actorType: string;
  createdAt: string;
}

export interface WorkspaceDetail {
  id: string;
  title: string;
  description: string | null;
  currency: string;
  amount: number | null;
  status: string;
  /** PREVIEW_ONLY is retired (unselectable/uncreatable — see src/validation/workspace.ts) but the type still allows it so pre-migration rows type-check; every row is converted to APPROVAL_ONLY by the Phase 8 data migration. */
  deliveryMode: "PAYMENT_REQUIRED" | "APPROVAL_ONLY" | "PREVIEW_ONLY";
  progress: number;
  dueDate: string | null;
  watermarkText: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  financiallyLocked: boolean;
  canCancel: boolean;
  canDelete: boolean;
  /** APPROVAL_ONLY only — workspace is AWAITING_CREATOR_RELEASE and no release has been triggered yet. */
  canReleaseFiles: boolean;
  /** PREVIEW_ONLY only — workspace is still open (IN_REVIEW/CHANGES_REQUESTED) and can be closed. */
  canCloseForReview: boolean;
  clientName: string;
  payments: WorkspacePaymentEntry[];
  activity: WorkspaceActivityEntry[];
  /** Most-recent ReviewLink (any status) for the review-link controls — never the raw token, only what's safe to display. */
  reviewLink: {
    status: string;
    tokenPrefix: string;
    /** null for a project-duration master link — see MASTER_LINK "Available for the duration of the project." */
    expiresAt: string | null;
    revokedAt: string | null;
    lastViewedAt: string | null;
    viewCount: number;
  } | null;
}

/**
 * Full workspace detail for /workspaces/[id]. Returns `null` (never
 * throws) for a nonexistent or not-owned workspace — the route calls
 * `notFound()` either way, so a caller can never distinguish "doesn't
 * exist" from "belongs to someone else."
 */
export async function getOwnedWorkspaceDetail(workspaceId: string): Promise<WorkspaceDetail | null> {
  const creator = await requireAuthenticatedUser();

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, creatorId: creator.id },
    include: {
      payments: {
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: { deliveryBundle: true, downloadGrant: true, breakdown: true },
      },
      activityLogs: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
      reviewLinks: { orderBy: [{ createdAt: "desc" }], take: 1 },
      deliveryBundles: { select: { id: true }, take: 1 },
    },
  });
  if (!workspace) return null;

  const locked = (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(workspace.status);

  return {
    id: workspace.id,
    title: workspace.title,
    description: workspace.description,
    currency: workspace.currency,
    amount: toDisplayNumberOrNull(workspace.amount),
    status: workspace.status,
    deliveryMode: workspace.deliveryMode,
    progress: workspace.progress,
    dueDate: workspace.dueDate ? workspace.dueDate.toISOString() : null,
    watermarkText: workspace.watermarkText,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    approvedAt: workspace.approvedAt ? workspace.approvedAt.toISOString() : null,
    paidAt: workspace.paidAt ? workspace.paidAt.toISOString() : null,
    deliveredAt: workspace.deliveredAt ? workspace.deliveredAt.toISOString() : null,
    cancelledAt: workspace.cancelledAt ? workspace.cancelledAt.toISOString() : null,
    financiallyLocked: locked,
    canReleaseFiles:
      workspace.deliveryMode === "APPROVAL_ONLY" &&
      workspace.status === "AWAITING_CREATOR_RELEASE" &&
      workspace.deliveryBundles.length === 0,
    canCloseForReview:
      workspace.deliveryMode === "PREVIEW_ONLY" &&
      (workspace.status === "IN_REVIEW" || workspace.status === "CHANGES_REQUESTED"),
    canCancel: !locked && workspace.status !== "CANCELLED",
    canDelete:
      workspace.status === "DRAFT" &&
      workspace.payments.length === 0 &&
      workspace.activityLogs.filter((entry) => entry.action !== ActivityAction.WORKSPACE_CREATED).length === 0,
    clientName: workspace.clientName,
    payments: workspace.payments.map((payment) => ({
      id: payment.id,
      amount: toDisplayNumber(payment.amount),
      currency: payment.currency,
      status: payment.status,
      gatewayOrderId: payment.gatewayOrderId,
      capturedAt: payment.capturedAt ? payment.capturedAt.toISOString() : null,
      failureCode: payment.failureCode,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
      delivery: payment.deliveryBundle
        ? {
            bundleStatus: payment.deliveryBundle.status,
            processingError: payment.deliveryBundle.processingError,
            downloadCount: payment.downloadGrant?.downloadCount ?? 0,
            maxDownloads: payment.downloadGrant?.maxDownloads ?? 0,
            grantStatus: payment.downloadGrant?.status ?? null,
            grantExpiresAt: payment.downloadGrant?.expiresAt ? payment.downloadGrant.expiresAt.toISOString() : null,
          }
        : null,
      breakdown: payment.breakdown
        ? {
            platformFeeBps: payment.breakdown.platformFeeBps,
            platformFeeAmount: Number(payment.breakdown.platformFeeSubunits) / 100,
            freelancerPayableAmount: Number(payment.breakdown.freelancerPayableSubunits) / 100,
          }
        : null,
    })),
    activity: workspace.activityLogs.map((entry) => ({
      id: entry.id,
      label: formatActivityLabel(entry.action, entry.metadata),
      actorName: entry.actorName,
      actorType: entry.actorType,
      createdAt: entry.createdAt.toISOString(),
    })),
    reviewLink: workspace.reviewLinks[0]
      ? {
          // Lazily-computed display status — nothing proactively flips
          // ACTIVE -> EXPIRED in the database, so an ACTIVE row whose
          // expiresAt has passed is still shown as expired here.
          status:
            workspace.reviewLinks[0].status === "ACTIVE" &&
            workspace.reviewLinks[0].expiresAt !== null &&
            workspace.reviewLinks[0].expiresAt <= new Date()
              ? "EXPIRED"
              : workspace.reviewLinks[0].status,
          tokenPrefix: workspace.reviewLinks[0].tokenPrefix,
          expiresAt: workspace.reviewLinks[0].expiresAt ? workspace.reviewLinks[0].expiresAt.toISOString() : null,
          revokedAt: workspace.reviewLinks[0].revokedAt ? workspace.reviewLinks[0].revokedAt.toISOString() : null,
          lastViewedAt: workspace.reviewLinks[0].lastViewedAt
            ? workspace.reviewLinks[0].lastViewedAt.toISOString()
            : null,
          viewCount: workspace.reviewLinks[0].viewCount,
        }
      : null,
  };
}

export interface WorkspaceEditDetail {
  id: string;
  title: string;
  description: string | null;
  clientName: string;
  currency: string;
  amount: number | null;
  dueDate: string | null;
  watermarkText: string | null;
  status: string;
  financiallyLocked: boolean;
  amountLocked: boolean;
}

/** Returns null (never throws) for a nonexistent/not-owned workspace, so the edit route can render a not-found state. */
export async function getOwnedWorkspaceForEdit(workspaceId: string): Promise<WorkspaceEditDetail | null> {
  const creator = await requireAuthenticatedUser();
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, creatorId: creator.id } });
  if (!workspace) return null;

  return {
    id: workspace.id,
    title: workspace.title,
    description: workspace.description,
    clientName: workspace.clientName,
    currency: workspace.currency,
    amount: toDisplayNumberOrNull(workspace.amount),
    dueDate: workspace.dueDate ? workspace.dueDate.toISOString().slice(0, 10) : null,
    watermarkText: workspace.watermarkText,
    status: workspace.status,
    financiallyLocked: (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(workspace.status),
    amountLocked: (AMOUNT_LOCK_STATUSES as readonly string[]).includes(workspace.status),
  };
}

export interface MutateWorkspaceResult {
  id: string;
}

/**
 * Creates a DRAFT workspace. `clientName` is a plain, workspace-scoped
 * text snapshot — no Client row is ever looked up, created, or attached
 * (clientId is left null). Derives creatorId from the session, and
 * writes the WORKSPACE_CREATED activity entry in the same transaction as
 * the insert.
 */
export async function createWorkspace(input: WorkspaceCreateInput): Promise<MutateWorkspaceResult> {
  const creator = await requireAuthenticatedUser();

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        creatorId: creator.id,
        clientName: input.clientName,
        title: input.title,
        description: input.description ?? null,
        currency: input.currency,
        amount: input.amount === undefined ? null : toDecimal(input.amount),
        deliveryMode: input.deliveryMode,
        watermarkText: input.watermarkText ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: "DRAFT",
        progress: 0,
      },
      select: { id: true },
    });

    await recordActivity(tx, {
      action: ActivityAction.WORKSPACE_CREATED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: workspace.id,
      metadata: { title: input.title },
    });
    await recordActivity(tx, {
      action: ActivityAction.DELIVERY_MODE_SELECTED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: workspace.id,
      metadata: { deliveryMode: input.deliveryMode },
    });

    return { id: workspace.id };
  });
}

/**
 * Updates a workspace after verifying ownership. For workspaces in a
 * financially-locked status (PAID/FILES_UNLOCKED/DELIVERED), amount and
 * currency are silently kept at their existing values — only descriptive
 * fields (title, description, watermark text, due date, client name)
 * apply — so a locked workspace can never end up with an inconsistent
 * payment record. `clientName` is a plain workspace-scoped text field;
 * editing it never creates, looks up, or attaches a Client row. Writes
 * one activity entry per kind of change that actually occurred (never
 * one for a no-op resubmission).
 */
export async function updateOwnedWorkspace(
  workspaceId: string,
  input: WorkspaceUpdateInput,
): Promise<MutateWorkspaceResult> {
  const { creator, workspace: existing } = await requireOwnedWorkspace(workspaceId);
  const locked = (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(existing.status);
  const amountLocked = (AMOUNT_LOCK_STATUSES as readonly string[]).includes(existing.status);

  const targetClientName = locked ? existing.clientName : input.clientName;
  const clientChangeMetadata: { fromClientName: string; toClientName: string } | null =
    !locked && input.clientName !== existing.clientName
      ? { fromClientName: existing.clientName, toClientName: input.clientName }
      : null;

  // Delivery mode is fixed at creation — never editable afterward (no
  // mode-switch UI exists; switching mid-workflow would strand whatever
  // approval/payment state already exists under the old mode's rules).
  const submittedAmount = input.amount === undefined ? null : toDecimal(input.amount);
  const targetAmount = amountLocked ? existing.amount : submittedAmount;
  const targetCurrency = amountLocked ? existing.currency : input.currency;
  const amountOrCurrencyChanged =
    !amountLocked &&
    ((existing.amount === null) !== (submittedAmount === null) ||
      (existing.amount !== null && submittedAmount !== null && !submittedAmount.equals(existing.amount)) ||
      input.currency !== existing.currency);

  const targetDueDate = input.dueDate ? new Date(input.dueDate) : null;
  const existingDueDateIso = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;
  const dueDateChanged = (input.dueDate ?? null) !== existingDueDateIso;

  const descriptiveChangedFields: string[] = [];
  if (input.title !== existing.title) descriptiveChangedFields.push("title");
  if ((input.description ?? null) !== existing.description) descriptiveChangedFields.push("description");
  if ((input.watermarkText ?? null) !== existing.watermarkText) descriptiveChangedFields.push("watermark text");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        title: input.title,
        description: input.description ?? null,
        watermarkText: input.watermarkText ?? null,
        clientName: targetClientName,
        amount: targetAmount,
        currency: targetCurrency,
        dueDate: targetDueDate,
      },
      select: { id: true },
    });

    if (clientChangeMetadata) {
      await recordActivity(tx, {
        action: ActivityAction.CLIENT_CHANGED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        workspaceId,
        metadata: clientChangeMetadata,
      });
    }
    if (amountOrCurrencyChanged) {
      await recordActivity(tx, {
        action: ActivityAction.AMOUNT_CHANGED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        workspaceId,
        metadata: {
          fromAmount: toDisplayNumberOrNull(existing.amount) ?? undefined,
          toAmount: toDisplayNumberOrNull(targetAmount) ?? undefined,
          currency: targetCurrency,
        },
      });
    }
    if (dueDateChanged) {
      await recordActivity(tx, {
        action: ActivityAction.DUE_DATE_CHANGED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        workspaceId,
        metadata: { fromDueDate: existingDueDateIso, toDueDate: input.dueDate ?? null },
      });
    }
    if (descriptiveChangedFields.length > 0) {
      await recordActivity(tx, {
        action: ActivityAction.WORKSPACE_UPDATED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        workspaceId,
        metadata: { changedFields: descriptiveChangedFields },
      });
    }

    return { id: updated.id };
  });
}

/** Cancels a workspace. Refuses for already-cancelled or financially-locked (PAID/FILES_UNLOCKED/DELIVERED) workspaces — payment history is never touched. */
export async function cancelOwnedWorkspace(workspaceId: string): Promise<void> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);

  assertWorkspaceTransition(workspace.status, "CANCELLED", workspace.deliveryMode);

  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await recordActivity(tx, {
      action: ActivityAction.WORKSPACE_CANCELLED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
    });
  });
}

/**
 * Creator-triggered closure of a PREVIEW_ONLY workspace once feedback is
 * complete — see DELIVERY_MODES.md. Moves IN_REVIEW/CHANGES_REQUESTED to
 * the terminal CLOSED status, after which the master review link becomes
 * read-only (no further comments/annotations, no version switching writes
 * anything new). There is no payment or file-release step in this mode.
 */
export async function closeWorkspaceForReview(workspaceId: string): Promise<void> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);

  assertWorkspaceTransition(workspace.status, "CLOSED", workspace.deliveryMode);

  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { status: "CLOSED" } });
    await recordActivity(tx, {
      action: ActivityAction.WORKSPACE_CLOSED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
    });
    await recordActivity(tx, {
      action: ActivityAction.REVIEW_LINK_READ_ONLY,
      actorType: "SYSTEM",
      actorName: "System",
      creatorId: creator.id,
      workspaceId,
    });
  });
}

export class WorkspaceNotDeletableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceNotDeletableError";
  }
}

/**
 * Permanently deletes a workspace — permitted only for an untouched DRAFT
 * workspace with zero payments and zero activity beyond its own creation
 * entry (see MUTATION_ARCHITECTURE.md "Safe deletion rules"). Everything
 * else must be cancelled instead.
 */
export async function deleteOwnedDraftWorkspace(workspaceId: string): Promise<void> {
  const { workspace } = await requireOwnedWorkspace(workspaceId);

  if (workspace.status !== "DRAFT") {
    throw new WorkspaceNotDeletableError("Only draft workspaces can be permanently deleted.");
  }

  const [paymentCount, extraActivityCount] = await Promise.all([
    prisma.payment.count({ where: { workspaceId } }),
    prisma.activityLog.count({
      where: { workspaceId, action: { not: ActivityAction.WORKSPACE_CREATED } },
    }),
  ]);
  if (paymentCount > 0) {
    throw new WorkspaceNotDeletableError("This workspace has payment history and cannot be deleted.");
  }
  if (extraActivityCount > 0) {
    throw new WorkspaceNotDeletableError("This workspace has activity beyond creation and cannot be deleted.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany({ where: { workspaceId } });
    await tx.workspace.delete({ where: { id: workspaceId } });
  });
}
