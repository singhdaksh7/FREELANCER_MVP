import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { requireOwnedWorkspace, requireClientAvailableToCreator } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction, formatActivityLabel } from "@/lib/activity-log";
import { toDecimal, toDisplayNumber } from "@/lib/decimal";
import { parseEnumParam, parseQueryParam, type RawSearchParams } from "@/lib/search-params";
import type { WorkspaceCreateInput, WorkspaceUpdateInput } from "@/validation/workspace";
import { WorkspaceStatus, type Prisma } from "@/generated/prisma/client";

export interface WorkspaceListItem {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  progress: number;
  publicToken: string | null;
  updatedAt: string;
  client: { id: string; name: string; company: string | null };
}

export interface WorkspaceClientOption {
  id: string;
  name: string;
}

const STATUS_FILTER_VALUES = ["All", ...Object.values(WorkspaceStatus)] as const;
const SORT_VALUES = ["recent", "title", "amount"] as const;
export type WorkspaceSort = (typeof SORT_VALUES)[number];

export interface WorkspaceFilters {
  q: string;
  status: (typeof STATUS_FILTER_VALUES)[number];
  clientId: string;
  sort: WorkspaceSort;
}

export interface WorkspacesResult {
  workspaces: WorkspaceListItem[];
  clientOptions: WorkspaceClientOption[];
  filters: WorkspaceFilters;
}

function mapWorkspace(
  workspace: Prisma.WorkspaceGetPayload<{
    include: { client: { select: { id: true; name: true; company: true } } };
  }>,
): WorkspaceListItem {
  return {
    id: workspace.id,
    title: workspace.title,
    description: workspace.description,
    amount: toDisplayNumber(workspace.amount),
    currency: workspace.currency,
    status: workspace.status,
    progress: workspace.progress,
    publicToken: workspace.publicToken,
    updatedAt: workspace.updatedAt.toISOString(),
    client: workspace.client,
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
  const clientIdParam = parseQueryParam(rawParams, "client");
  const sort = parseEnumParam(rawParams, "sort", SORT_VALUES, "recent");

  const where: Prisma.WorkspaceWhereInput = {
    creatorId: creator.id,
    ...(status !== "All" ? { status } : {}),
    ...(clientIdParam ? { clientId: clientIdParam } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
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

  const [workspaces, clientOptions] = await Promise.all([
    prisma.workspace.findMany({
      where,
      orderBy,
      include: { client: { select: { id: true, name: true, company: true } } },
    }),
    prisma.client.findMany({
      where: { creatorId: creator.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    workspaces: workspaces.map(mapWorkspace),
    clientOptions,
    filters: { q, status, clientId: clientIdParam || "All", sort },
  };
}

/** Statuses past which financial truth (amount/currency) must not change, and past which the workspace can no longer be cancelled. */
export const FINANCIAL_LOCK_STATUSES = ["PAID", "FILES_UNLOCKED", "DELIVERED"] as const;

export interface WorkspacePaymentEntry {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
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
  amount: number;
  status: string;
  progress: number;
  dueDate: string | null;
  watermarkText: string | null;
  publicToken: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  financiallyLocked: boolean;
  canCancel: boolean;
  canDelete: boolean;
  client: { id: string; name: string; email: string; company: string | null; phone: string | null };
  payments: WorkspacePaymentEntry[];
  activity: WorkspaceActivityEntry[];
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
      client: { select: { id: true, name: true, email: true, company: true, phone: true } },
      payments: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
      activityLogs: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    },
  });
  if (!workspace) return null;

  const locked = (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(workspace.status);

  return {
    id: workspace.id,
    title: workspace.title,
    description: workspace.description,
    currency: workspace.currency,
    amount: toDisplayNumber(workspace.amount),
    status: workspace.status,
    progress: workspace.progress,
    dueDate: workspace.dueDate ? workspace.dueDate.toISOString() : null,
    watermarkText: workspace.watermarkText,
    publicToken: workspace.publicToken,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    approvedAt: workspace.approvedAt ? workspace.approvedAt.toISOString() : null,
    paidAt: workspace.paidAt ? workspace.paidAt.toISOString() : null,
    deliveredAt: workspace.deliveredAt ? workspace.deliveredAt.toISOString() : null,
    cancelledAt: workspace.cancelledAt ? workspace.cancelledAt.toISOString() : null,
    financiallyLocked: locked,
    canCancel: !locked && workspace.status !== "CANCELLED",
    canDelete:
      workspace.status === "DRAFT" &&
      workspace.payments.length === 0 &&
      workspace.activityLogs.filter((entry) => entry.action !== ActivityAction.WORKSPACE_CREATED).length === 0,
    client: workspace.client,
    payments: workspace.payments.map((payment) => ({
      id: payment.id,
      amount: toDisplayNumber(payment.amount),
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
    })),
    activity: workspace.activityLogs.map((entry) => ({
      id: entry.id,
      label: formatActivityLabel(entry.action, entry.metadata),
      actorName: entry.actorName,
      actorType: entry.actorType,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export interface WorkspaceEditDetail {
  id: string;
  title: string;
  description: string | null;
  clientId: string;
  currency: string;
  amount: number;
  dueDate: string | null;
  watermarkText: string | null;
  status: string;
  financiallyLocked: boolean;
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
    clientId: workspace.clientId,
    currency: workspace.currency,
    amount: toDisplayNumber(workspace.amount),
    dueDate: workspace.dueDate ? workspace.dueDate.toISOString().slice(0, 10) : null,
    watermarkText: workspace.watermarkText,
    status: workspace.status,
    financiallyLocked: (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(workspace.status),
  };
}

export interface MutateWorkspaceResult {
  id: string;
}

/**
 * Creates a DRAFT workspace. Confirms the submitted clientId actually
 * belongs to the authenticated creator (never trusts it blindly), derives
 * creatorId from the session, and writes the WORKSPACE_CREATED activity
 * entry in the same transaction as the insert.
 */
export async function createWorkspace(input: WorkspaceCreateInput): Promise<MutateWorkspaceResult> {
  const creator = await requireAuthenticatedUser();
  await requireClientAvailableToCreator(input.clientId);

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        creatorId: creator.id,
        clientId: input.clientId,
        title: input.title,
        description: input.description ?? null,
        currency: input.currency,
        amount: toDecimal(input.amount),
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

    return { id: workspace.id };
  });
}

/**
 * Updates a workspace after verifying ownership (and, if the client is
 * being changed, ownership of the new client too). For workspaces in a
 * financially-locked status (PAID/FILES_UNLOCKED/DELIVERED), amount,
 * currency, and client are silently kept at their existing values — only
 * descriptive fields (title, description, watermark text, due date) apply
 * — so a locked workspace can never end up with an inconsistent payment
 * record. Writes one activity entry per kind of change that actually
 * occurred (never one for a no-op resubmission).
 */
export async function updateOwnedWorkspace(
  workspaceId: string,
  input: WorkspaceUpdateInput,
): Promise<MutateWorkspaceResult> {
  const { creator, workspace: existing } = await requireOwnedWorkspace(workspaceId);
  const locked = (FINANCIAL_LOCK_STATUSES as readonly string[]).includes(existing.status);

  let targetClientId = existing.clientId;
  let clientChangeMetadata: { fromClientName: string; toClientName: string } | null = null;
  if (!locked && input.clientId !== existing.clientId) {
    const { client: newClient } = await requireClientAvailableToCreator(input.clientId);
    targetClientId = newClient.id;
    clientChangeMetadata = { fromClientName: existing.client.name, toClientName: newClient.name };
  }

  const submittedAmount = toDecimal(input.amount);
  const targetAmount = locked ? existing.amount : submittedAmount;
  const targetCurrency = locked ? existing.currency : input.currency;
  const amountOrCurrencyChanged =
    !locked && (!submittedAmount.equals(existing.amount) || input.currency !== existing.currency);

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
        clientId: targetClientId,
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
          fromAmount: toDisplayNumber(existing.amount),
          toAmount: toDisplayNumber(targetAmount),
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

export class InvalidStatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusTransitionError";
  }
}

/** Cancels a workspace. Refuses for already-cancelled or financially-locked (PAID/FILES_UNLOCKED/DELIVERED) workspaces — payment history is never touched. */
export async function cancelOwnedWorkspace(workspaceId: string): Promise<void> {
  const { creator, workspace } = await requireOwnedWorkspace(workspaceId);

  if (workspace.status === "CANCELLED") {
    throw new InvalidStatusTransitionError("This workspace is already cancelled.");
  }
  if ((FINANCIAL_LOCK_STATUSES as readonly string[]).includes(workspace.status)) {
    throw new InvalidStatusTransitionError("Paid or delivered workspaces cannot be cancelled.");
  }

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
