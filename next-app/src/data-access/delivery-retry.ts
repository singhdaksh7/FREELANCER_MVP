import "server-only";
import { prisma } from "@/lib/prisma";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import { getDeliveryWorkerConfig } from "@/storage/storage-config";
import { wakeWorker } from "@/lib/worker-wake";

/**
 * Creator-triggered retry for a permanently-failed delivery-bundle build —
 * see SECURE_DOWNLOAD_ARCHITECTURE.md. Never available for a captured
 * payment itself (that's never retried — only delivery preparation can
 * fail and be retried). Each retry creates a NEW DeliveryBundleJob row
 * (one row per attempt, same convention as FileProcessingJob — see
 * FILE_STORAGE_ARCHITECTURE.md), bounded by DELIVERY_WORKER_MAX_ATTEMPTS.
 */

export class DeliveryNotRetryableError extends Error {
  constructor(message = "This delivery is not currently in a failed state.") {
    super(message);
    this.name = "DeliveryNotRetryableError";
  }
}

export class DeliveryRetryLimitReachedError extends Error {
  constructor(message = "This delivery has reached its maximum number of retry attempts.") {
    super(message);
    this.name = "DeliveryRetryLimitReachedError";
  }
}

export async function retryDeliveryPreparation(workspaceId: string, paymentId: string): Promise<void> {
  const { creator } = await requireOwnedWorkspace(workspaceId);

  const bundle = await prisma.deliveryBundle.findFirst({
    where: { workspaceId, paymentId },
    include: { jobs: true },
  });
  if (!bundle || bundle.status !== "FAILED") {
    throw new DeliveryNotRetryableError();
  }

  const { maxAttempts } = getDeliveryWorkerConfig();
  if (bundle.jobs.length >= maxAttempts) {
    throw new DeliveryRetryLimitReachedError();
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryBundle.update({ where: { id: bundle.id }, data: { status: "PENDING", processingError: null } });
    await tx.deliveryBundleJob.create({ data: { deliveryBundleId: bundle.id, status: "PENDING" } });
    await recordActivity(tx, {
      action: ActivityAction.DELIVERY_PREPARATION_STARTED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId,
    });
  });

  wakeWorker("delivery");
}
