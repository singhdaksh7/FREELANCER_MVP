ALTER TABLE "upload_sessions" ADD COLUMN "timingCorrelationId" TEXT;
UPDATE "upload_sessions" SET "timingCorrelationId" = md5(random()::text || clock_timestamp()::text || id) WHERE "timingCorrelationId" IS NULL;
ALTER TABLE "upload_sessions" ALTER COLUMN "timingCorrelationId" SET NOT NULL;
CREATE UNIQUE INDEX "upload_sessions_timingCorrelationId_key" ON "upload_sessions"("timingCorrelationId");
ALTER TABLE "file_processing_jobs" ADD COLUMN "timingCorrelationId" TEXT;
