-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('PAYMENT_REQUIRED', 'APPROVAL_ONLY', 'PREVIEW_ONLY');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('FREEHAND', 'CIRCLE');

-- CreateEnum
CREATE TYPE "PayoutLedgerType" AS ENUM ('PAYMENT_CREDIT', 'PLATFORM_FEE', 'PAYOUT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('PAYMENT', 'DELIVERY', 'QUALITY_DISPUTE', 'FILE_PROCESSING', 'ACCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'WAITING_FOR_CREATOR', 'WAITING_FOR_CLIENT', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportAuthorType" AS ENUM ('CREATOR', 'CLIENT', 'ADMIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkspaceStatus" ADD VALUE 'AWAITING_CREATOR_RELEASE';
ALTER TYPE "WorkspaceStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "download_grants" DROP COLUMN "rawTokenOnce",
ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "review_comments" ADD COLUMN     "pinNumber" INTEGER;

-- AlterTable
ALTER TABLE "review_links" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "workspace_approvals" ADD COLUMN     "approvedAmount" DECIMAL(12,2),
ADD COLUMN     "approvedCurrency" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'PAYMENT_REQUIRED',
ALTER COLUMN "amount" DROP NOT NULL;

-- CreateTable
CREATE TABLE "review_annotations" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceFileId" TEXT NOT NULL,
    "fileVersionId" TEXT NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_breakdowns" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "projectAmountSubunits" BIGINT NOT NULL,
    "clientChargedSubunits" BIGINT NOT NULL,
    "platformFeeBps" INTEGER NOT NULL,
    "platformFeeSubunits" BIGINT NOT NULL,
    "gatewayFeeSubunits" BIGINT,
    "gatewayFeeTaxSubunits" BIGINT,
    "freelancerPayableSubunits" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_balance_accounts" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pendingSubunits" BIGINT NOT NULL DEFAULT 0,
    "availableSubunits" BIGINT NOT NULL DEFAULT 0,
    "paidOutSubunits" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_balance_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_ledger_entries" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "paymentId" TEXT,
    "type" "PayoutLedgerType" NOT NULL,
    "amountSubunits" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "payout_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "workspaceId" TEXT,
    "creatorId" TEXT,
    "reviewLinkId" TEXT,
    "category" "SupportTicketCategory" NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdByType" "SupportAuthorType" NOT NULL,
    "creatorAuthorId" TEXT,
    "reviewerName" TEXT,
    "reviewerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "SupportAuthorType" NOT NULL,
    "creatorAuthorId" TEXT,
    "adminAuthorId" TEXT,
    "reviewerName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_annotations_workspaceId_idx" ON "review_annotations"("workspaceId");

-- CreateIndex
CREATE INDEX "review_annotations_fileVersionId_idx" ON "review_annotations"("fileVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_breakdowns_paymentId_key" ON "payment_breakdowns"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "creator_balance_accounts_creatorId_key" ON "creator_balance_accounts"("creatorId");

-- CreateIndex
CREATE INDEX "payout_ledger_entries_creatorId_idx" ON "payout_ledger_entries"("creatorId");

-- CreateIndex
CREATE INDEX "payout_ledger_entries_creatorId_status_idx" ON "payout_ledger_entries"("creatorId", "status");

-- CreateIndex
CREATE INDEX "payout_ledger_entries_paymentId_idx" ON "payout_ledger_entries"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticketNumber_key" ON "support_tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "support_tickets_workspaceId_idx" ON "support_tickets"("workspaceId");

-- CreateIndex
CREATE INDEX "support_tickets_creatorId_idx" ON "support_tickets"("creatorId");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_reviewLinkId_idx" ON "support_tickets"("reviewLinkId");

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticketId_idx" ON "support_ticket_messages"("ticketId");

-- AddForeignKey
ALTER TABLE "review_annotations" ADD CONSTRAINT "review_annotations_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "review_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_annotations" ADD CONSTRAINT "review_annotations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_annotations" ADD CONSTRAINT "review_annotations_workspaceFileId_fkey" FOREIGN KEY ("workspaceFileId") REFERENCES "workspace_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_annotations" ADD CONSTRAINT "review_annotations_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "file_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_breakdowns" ADD CONSTRAINT "payment_breakdowns_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_balance_accounts" ADD CONSTRAINT "creator_balance_accounts_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_ledger_entries" ADD CONSTRAINT "payout_ledger_entries_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_ledger_entries" ADD CONSTRAINT "payout_ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reviewLinkId_fkey" FOREIGN KEY ("reviewLinkId") REFERENCES "review_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_creatorAuthorId_fkey" FOREIGN KEY ("creatorAuthorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_creatorAuthorId_fkey" FOREIGN KEY ("creatorAuthorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_adminAuthorId_fkey" FOREIGN KEY ("adminAuthorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

