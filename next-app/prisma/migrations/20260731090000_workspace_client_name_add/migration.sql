-- Phase 8 — step 1 of 5. Add the workspace-scoped client-name snapshot
-- column as nullable so it can be backfilled before becoming required.
-- See MIGRATION_STATUS.md "Phase 8 — product simplification".

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "clientName" TEXT;
