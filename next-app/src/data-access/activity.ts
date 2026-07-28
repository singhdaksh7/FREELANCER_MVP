import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityActionCode, ActivityMetadata } from "@/lib/activity-log";

export interface RecordActivityInput {
  action: ActivityActionCode;
  actorType: "CREATOR";
  actorName: string;
  creatorId: string;
  workspaceId?: string;
  clientId?: string;
  metadata?: ActivityMetadata;
}

/**
 * Writes one ActivityLog row. Always called inside the same
 * `prisma.$transaction` as the mutation it documents (see
 * MUTATION_ARCHITECTURE.md "Transaction strategy") so a failed mutation can
 * never leave a dangling activity entry, and a successful mutation can
 * never silently skip logging.
 */
export async function recordActivity(tx: Prisma.TransactionClient, input: RecordActivityInput): Promise<void> {
  await tx.activityLog.create({
    data: {
      action: input.action,
      actorType: input.actorType,
      actorName: input.actorName,
      creatorId: input.creatorId,
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}
