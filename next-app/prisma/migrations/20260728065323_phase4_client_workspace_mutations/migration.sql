-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "creatorId" TEXT,
ALTER COLUMN "workspaceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "watermarkText" TEXT;

-- CreateIndex
CREATE INDEX "activity_logs_clientId_idx" ON "activity_logs"("clientId");

-- CreateIndex
CREATE INDEX "activity_logs_creatorId_idx" ON "activity_logs"("creatorId");

-- CreateIndex
CREATE INDEX "activity_logs_creatorId_createdAt_idx" ON "activity_logs"("creatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
