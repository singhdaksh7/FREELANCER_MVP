-- Phase 8 — step 4 of 5. clientId stops being required now that
-- clientName is the source of truth for display. New workspaces are
-- created with clientId = NULL (no Client row is ever created by the
-- simplified wizard); existing workspaces keep their historical
-- clientId untouched. The FK is recreated as ON DELETE SET NULL (was
-- RESTRICT) since a workspace no longer needs a live Client row to
-- exist.

-- DropForeignKey
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_clientId_fkey";

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "clientId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
