import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser, type AuthenticatedCreator } from "./auth";

/**
 * Thrown whenever a mutation targets a Client/Workspace id that either
 * doesn't exist or doesn't belong to the authenticated creator. Both cases
 * are collapsed into the same generic error deliberately — never reveal to
 * a caller whether a record exists under someone else's account (see
 * MUTATION_ARCHITECTURE.md "Ownership strategy").
 */
export class OwnershipError extends Error {
  constructor(message = "Not found, or you do not have access to it.") {
    super(message);
    this.name = "OwnershipError";
  }
}

/**
 * Loads a Client scoped to the authenticated creator. Throws OwnershipError
 * if it doesn't exist or belongs to a different creator — callers never
 * need to separately check `client.creatorId`.
 */
export async function requireOwnedClient(
  clientId: string,
): Promise<{ creator: AuthenticatedCreator; client: NonNullable<Awaited<ReturnType<typeof prisma.client.findFirst>>> }> {
  const creator = await requireAuthenticatedUser();
  const client = await prisma.client.findFirst({
    where: { id: clientId, creatorId: creator.id },
  });
  if (!client) throw new OwnershipError();
  return { creator, client };
}

/**
 * Loads a Workspace scoped to the authenticated creator. Throws
 * OwnershipError if it doesn't exist or belongs to a different creator.
 * `clientName` is a plain scalar column on Workspace (Phase 8) — no
 * Client join is needed to display it.
 */
export async function requireOwnedWorkspace(workspaceId: string) {
  const creator = await requireAuthenticatedUser();
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, creatorId: creator.id },
  });
  if (!workspace) throw new OwnershipError();
  return { creator, workspace };
}

/**
 * Loads a WorkspaceFile (with its parent Workspace) scoped to the
 * authenticated creator — resolves ownership through the file's
 * workspace, never trusting a `workspaceId` a caller might separately
 * supply. Throws OwnershipError for a missing, not-owned, or
 * already-soft-deleted file (a deleted file is treated as "not found,"
 * not surfaced as a distinct state, to a mutation that didn't already
 * know its id).
 */
export async function requireOwnedWorkspaceFile(fileId: string) {
  const creator = await requireAuthenticatedUser();
  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, deletedAt: null, workspace: { creatorId: creator.id } },
    include: {
      workspace: { select: { id: true, creatorId: true, status: true } },
      currentVersion: true,
    },
  });
  if (!file) throw new OwnershipError();
  return { creator, file };
}
