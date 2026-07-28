import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { sumDecimals, toDisplayNumber } from "@/lib/decimal";
import { parseQueryParam, type RawSearchParams } from "@/lib/search-params";
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
