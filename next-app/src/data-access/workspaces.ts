import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { toDisplayNumber } from "@/lib/decimal";
import { parseEnumParam, parseQueryParam, type RawSearchParams } from "@/lib/search-params";
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
