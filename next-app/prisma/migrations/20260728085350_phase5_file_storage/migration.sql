-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('IMAGE', 'PDF', 'ARCHIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOAD_PENDING', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "UploadSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'ABORTED');

-- CreateTable
CREATE TABLE "workspace_files" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "fileKind" "FileKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOAD_PENDING',
    "currentVersionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workspace_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "originalStorageKey" TEXT NOT NULL,
    "previewStorageKey" TEXT,
    "originalChecksum" TEXT NOT NULL,
    "previewChecksum" TEXT,
    "originalSizeBytes" BIGINT NOT NULL,
    "previewSizeBytes" BIGINT,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_processing_jobs" (
    "id" TEXT NOT NULL,
    "fileVersionId" TEXT NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "declaredFileName" TEXT NOT NULL,
    "expectedMimeType" TEXT NOT NULL,
    "expectedSizeBytes" BIGINT NOT NULL,
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_files_currentVersionId_key" ON "workspace_files"("currentVersionId");

-- CreateIndex
CREATE INDEX "workspace_files_workspaceId_idx" ON "workspace_files"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_files_workspaceId_status_idx" ON "workspace_files"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "workspace_files_workspaceId_deletedAt_idx" ON "workspace_files"("workspaceId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_originalStorageKey_key" ON "file_versions"("originalStorageKey");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_previewStorageKey_key" ON "file_versions"("previewStorageKey");

-- CreateIndex
CREATE INDEX "file_versions_fileId_idx" ON "file_versions"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_fileId_versionNumber_key" ON "file_versions"("fileId", "versionNumber");

-- CreateIndex
CREATE INDEX "file_processing_jobs_fileVersionId_idx" ON "file_processing_jobs"("fileVersionId");

-- CreateIndex
CREATE INDEX "file_processing_jobs_status_idx" ON "file_processing_jobs"("status");

-- CreateIndex
CREATE INDEX "file_processing_jobs_status_createdAt_idx" ON "file_processing_jobs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_storageKey_key" ON "upload_sessions"("storageKey");

-- CreateIndex
CREATE INDEX "upload_sessions_workspaceId_idx" ON "upload_sessions"("workspaceId");

-- CreateIndex
CREATE INDEX "upload_sessions_creatorId_idx" ON "upload_sessions"("creatorId");

-- CreateIndex
CREATE INDEX "upload_sessions_status_expiresAt_idx" ON "upload_sessions"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "file_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "workspace_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_processing_jobs" ADD CONSTRAINT "file_processing_jobs_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "file_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
