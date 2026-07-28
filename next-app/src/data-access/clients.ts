import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { requireOwnedClient } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { sumDecimals, toDisplayNumber } from "@/lib/decimal";
import { parseQueryParam, type RawSearchParams } from "@/lib/search-params";
import type { ClientInput } from "@/validation/client";
import type { Prisma } from "@/generated/prisma/client";

const TERMINAL_PAID_STATUSES = ["PAID", "FILES_UNLOCKED", "DELIVERED"] as const;

export interface ClientListItem {
  id: string;
  name: string;
  email: string;
  company: string | null;
  /** Derived: workspaces not yet in a terminal-paid status. */
  activeWorkspaceCount: number;
  /** Derived: sum of amounts for this client's not-yet-paid workspaces. */
  outstandingAmount: number;
  /** Derived: most recent workspace `updatedAt`, or null if they have none. */
  lastActivityAt: string | null;
  /** Derived, not stored: "Active" if they have any non-terminal workspace. */
  status: "Active" | "Inactive";
}

export interface ClientsResult {
  clients: ClientListItem[];
  q: string;
  /** True if the creator has any clients at all, independent of the current search. */
  hasAnyClients: boolean;
}

type ClientWithWorkspaces = Prisma.ClientGetPayload<{
  include: { workspaces: { select: { amount: true; status: true; updatedAt: true } } };
}>;

function mapClient(client: ClientWithWorkspaces): ClientListItem {
  const activeWorkspaces = client.workspaces.filter(
    (w) => !TERMINAL_PAID_STATUSES.includes(w.status as (typeof TERMINAL_PAID_STATUSES)[number]),
  );
  const outstandingAmount = toDisplayNumber(sumDecimals(activeWorkspaces.map((w) => w.amount)));
  const lastActivityAt = client.workspaces.reduce<string | null>((latest, w) => {
    const iso = w.updatedAt.toISOString();
    return !latest || iso > latest ? iso : latest;
  }, null);

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    company: client.company,
    activeWorkspaceCount: activeWorkspaces.length,
    outstandingAmount,
    lastActivityAt,
    status: activeWorkspaces.length > 0 ? "Active" : "Inactive",
  };
}

/** Database-backed search over the authenticated creator's clients, with derived per-client metrics. */
export async function getClients(rawParams: RawSearchParams): Promise<ClientsResult> {
  const creator = await requireAuthenticatedUser();
  const q = parseQueryParam(rawParams, "q");

  const where: Prisma.ClientWhereInput = {
    creatorId: creator.id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [clients, totalClientCount] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: [{ name: "asc" }],
      include: { workspaces: { select: { amount: true, status: true, updatedAt: true } } },
    }),
    prisma.client.count({ where: { creatorId: creator.id } }),
  ]);

  return { clients: clients.map(mapClient), q, hasAnyClients: totalClientCount > 0 };
}

export interface ClientOption {
  id: string;
  name: string;
}

/** Lightweight id/name list for select inputs (workspace create/edit forms). */
export async function getClientOptionsForCreator(): Promise<ClientOption[]> {
  const creator = await requireAuthenticatedUser();
  return prisma.client.findMany({
    where: { creatorId: creator.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface ClientEditDetail {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  notes: string | null;
}

/** Returns null (never throws) so the edit page can render a not-found state for a missing/unowned client. */
export async function getOwnedClientForEdit(clientId: string): Promise<ClientEditDetail | null> {
  const creator = await requireAuthenticatedUser();
  return prisma.client.findFirst({
    where: { id: clientId, creatorId: creator.id },
    select: { id: true, name: true, email: true, company: true, phone: true, notes: true },
  });
}

export interface MutateClientResult {
  id: string;
}

/**
 * Creates a client under the authenticated creator. `creatorId` is never
 * accepted as input — always derived from the session. Writes a
 * CLIENT_CREATED activity entry in the same transaction (see
 * MUTATION_ARCHITECTURE.md — clients are not tied to a workspace, so this
 * uses the nullable-workspaceId ActivityLog shape added in Phase 4).
 */
export async function createClient(input: ClientInput): Promise<MutateClientResult> {
  const creator = await requireAuthenticatedUser();

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        creatorId: creator.id,
        name: input.name,
        email: input.email,
        company: input.company ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true, name: true },
    });

    await recordActivity(tx, {
      action: ActivityAction.CLIENT_CREATED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      clientId: client.id,
      metadata: { name: client.name },
    });

    return { id: client.id };
  });
}

const CLIENT_FIELD_LABELS: Record<string, string> = {
  name: "name",
  email: "email",
  company: "company",
  phone: "phone",
  notes: "notes",
};

/**
 * Updates a client after verifying ownership. Only writes an activity
 * entry when something actually changed, so a no-op resubmission never
 * creates a misleading audit row.
 */
export async function updateOwnedClient(clientId: string, input: ClientInput): Promise<MutateClientResult> {
  const { creator, client: existing } = await requireOwnedClient(clientId);

  const nextValues: Record<keyof typeof CLIENT_FIELD_LABELS, string | null> = {
    name: input.name,
    email: input.email,
    company: input.company ?? null,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
  };
  const existingValues: Record<keyof typeof CLIENT_FIELD_LABELS, string | null> = {
    name: existing.name,
    email: existing.email,
    company: existing.company,
    phone: existing.phone,
    notes: existing.notes,
  };
  const changedFields = (Object.keys(CLIENT_FIELD_LABELS) as (keyof typeof CLIENT_FIELD_LABELS)[]).filter(
    (field) => nextValues[field] !== existingValues[field],
  );

  return prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
      where: { id: clientId },
      data: nextValues,
      select: { id: true },
    });

    if (changedFields.length > 0) {
      await recordActivity(tx, {
        action: ActivityAction.CLIENT_UPDATED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        clientId: updated.id,
        metadata: { changedFields: changedFields.map((field) => CLIENT_FIELD_LABELS[field]) },
      });
    }

    return { id: updated.id };
  });
}

export class ClientHasWorkspacesError extends Error {
  constructor(message = "This client has workspaces and cannot be deleted.") {
    super(message);
    this.name = "ClientHasWorkspacesError";
  }
}

/**
 * Deletes a client only if it has zero associated workspaces (never
 * cascades over paid/active workspace history). The CLIENT_DELETED
 * activity row is written without `clientId` set — the client no longer
 * exists once this transaction commits, so the foreign key can't point at
 * it; the client's name is preserved in `metadata` instead.
 */
export async function deleteOwnedUnusedClient(clientId: string): Promise<void> {
  const { creator, client } = await requireOwnedClient(clientId);

  const workspaceCount = await prisma.workspace.count({ where: { clientId } });
  if (workspaceCount > 0) {
    throw new ClientHasWorkspacesError();
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.client.delete({ where: { id: clientId } });
      await recordActivity(tx, {
        action: ActivityAction.CLIENT_DELETED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        metadata: { name: client.name },
      });
    });
  } catch (error) {
    // Race-safe backstop: Workspace.clientId is onDelete: Restrict, so a
    // workspace created between the count check above and this delete
    // still can't leave a dangling reference — Postgres rejects it (P2003)
    // and this is surfaced as the same safe, expected error.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      throw new ClientHasWorkspacesError();
    }
    throw error;
  }
}
