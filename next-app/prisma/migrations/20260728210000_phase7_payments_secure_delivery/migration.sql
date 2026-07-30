-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "DownloadGrantStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "DeliveryBundleStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DownloadType" AS ENUM ('INDIVIDUAL', 'BUNDLE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "amountSubunits" BIGINT NOT NULL,
ADD COLUMN     "approvalId" TEXT NOT NULL,
ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "gatewaySignatureVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "reviewLinkId" TEXT;

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "status" "DownloadGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxDownloads" INTEGER NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "download_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_grant_files" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "workspaceFileId" TEXT NOT NULL,
    "fileVersionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_grant_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_logs" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "workspaceFileId" TEXT,
    "fileVersionId" TEXT,
    "downloadType" "DownloadType" NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_bundles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "status" "DeliveryBundleStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "checksum" TEXT,
    "sizeBytes" BIGINT,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_bundle_jobs" (
    "id" TEXT NOT NULL,
    "deliveryBundleId" TEXT NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processingError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_bundle_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_externalEventId_key" ON "webhook_events"("externalEventId");

-- CreateIndex
CREATE INDEX "webhook_events_processingStatus_idx" ON "webhook_events"("processingStatus");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_idx" ON "webhook_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "download_grants_paymentId_key" ON "download_grants"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "download_grants_tokenHash_key" ON "download_grants"("tokenHash");

-- CreateIndex
CREATE INDEX "download_grants_workspaceId_idx" ON "download_grants"("workspaceId");

-- CreateIndex
CREATE INDEX "download_grants_status_expiresAt_idx" ON "download_grants"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "download_grant_files_grantId_idx" ON "download_grant_files"("grantId");

-- CreateIndex
CREATE INDEX "download_logs_grantId_idx" ON "download_logs"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_bundles_paymentId_key" ON "delivery_bundles"("paymentId");

-- CreateIndex
CREATE INDEX "delivery_bundles_workspaceId_idx" ON "delivery_bundles"("workspaceId");

-- CreateIndex
CREATE INDEX "delivery_bundle_jobs_status_idx" ON "delivery_bundle_jobs"("status");

-- CreateIndex
CREATE INDEX "delivery_bundle_jobs_status_createdAt_idx" ON "delivery_bundle_jobs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_approvalId_idx" ON "payments"("approvalId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "workspace_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewLinkId_fkey" FOREIGN KEY ("reviewLinkId") REFERENCES "review_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "workspace_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_grant_files" ADD CONSTRAINT "download_grant_files_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "download_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_grant_files" ADD CONSTRAINT "download_grant_files_workspaceFileId_fkey" FOREIGN KEY ("workspaceFileId") REFERENCES "workspace_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_grant_files" ADD CONSTRAINT "download_grant_files_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "file_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "download_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_bundles" ADD CONSTRAINT "delivery_bundles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_bundles" ADD CONSTRAINT "delivery_bundles_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_bundles" ADD CONSTRAINT "delivery_bundles_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "workspace_approvals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_bundle_jobs" ADD CONSTRAINT "delivery_bundle_jobs_deliveryBundleId_fkey" FOREIGN KEY ("deliveryBundleId") REFERENCES "delivery_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

