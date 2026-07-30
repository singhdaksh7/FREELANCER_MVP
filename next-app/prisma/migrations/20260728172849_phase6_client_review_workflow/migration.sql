-- CreateEnum
CREATE TYPE "ReviewLinkStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReviewAuthorType" AS ENUM ('CREATOR', 'CLIENT');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('OPEN', 'RESOLVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "FileVersionStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- DropIndex
DROP INDEX "workspaces_publicToken_key";

-- AlterTable
ALTER TABLE "file_versions" ADD COLUMN     "status" "FileVersionStatus" NOT NULL DEFAULT 'PROCESSING',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "upload_sessions" ADD COLUMN     "targetFileId" TEXT;

-- AlterTable
ALTER TABLE "workspace_files" ADD COLUMN     "pendingVersionId" TEXT;

-- AlterTable
ALTER TABLE "workspaces" DROP COLUMN "publicToken",
DROP COLUMN "sharedAt";

-- CreateTable
CREATE TABLE "review_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "status" "ReviewLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "replacedById" TEXT,

    CONSTRAINT "review_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceFileId" TEXT,
    "fileVersionId" TEXT,
    "parentId" TEXT,
    "authorType" "ReviewAuthorType" NOT NULL,
    "creatorAuthorId" TEXT,
    "reviewerName" TEXT,
    "reviewerEmail" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'OPEN',
    "pinX" DOUBLE PRECISION,
    "pinY" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewLinkId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "reviewerEmail" TEXT,
    "summary" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_approvals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewLinkId" TEXT NOT NULL,
    "approvedFileVersionSnapshot" JSONB NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerEmail" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "workspace_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_links_tokenHash_key" ON "review_links"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "review_links_replacedById_key" ON "review_links"("replacedById");

-- CreateIndex
CREATE INDEX "review_links_workspaceId_idx" ON "review_links"("workspaceId");

-- CreateIndex
CREATE INDEX "review_links_workspaceId_status_idx" ON "review_links"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "review_comments_workspaceId_idx" ON "review_comments"("workspaceId");

-- CreateIndex
CREATE INDEX "review_comments_workspaceId_status_idx" ON "review_comments"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "review_comments_parentId_idx" ON "review_comments"("parentId");

-- CreateIndex
CREATE INDEX "change_requests_workspaceId_idx" ON "change_requests"("workspaceId");

-- CreateIndex
CREATE INDEX "change_requests_workspaceId_status_idx" ON "change_requests"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "workspace_approvals_workspaceId_idx" ON "workspace_approvals"("workspaceId");

-- CreateIndex
CREATE INDEX "file_versions_fileId_submittedAt_idx" ON "file_versions"("fileId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_files_pendingVersionId_key" ON "workspace_files"("pendingVersionId");

-- AddForeignKey
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_pendingVersionId_fkey" FOREIGN KEY ("pendingVersionId") REFERENCES "file_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_targetFileId_fkey" FOREIGN KEY ("targetFileId") REFERENCES "workspace_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_links" ADD CONSTRAINT "review_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_links" ADD CONSTRAINT "review_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_links" ADD CONSTRAINT "review_links_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "review_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_workspaceFileId_fkey" FOREIGN KEY ("workspaceFileId") REFERENCES "workspace_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "file_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "review_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_creatorAuthorId_fkey" FOREIGN KEY ("creatorAuthorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewLinkId_fkey" FOREIGN KEY ("reviewLinkId") REFERENCES "review_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_approvals" ADD CONSTRAINT "workspace_approvals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_approvals" ADD CONSTRAINT "workspace_approvals_reviewLinkId_fkey" FOREIGN KEY ("reviewLinkId") REFERENCES "review_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

