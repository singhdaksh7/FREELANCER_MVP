-- Phase 8 — step 3 of 5. Every row is backfilled by the previous
-- migration, so clientName can now be made required. All new workspace
-- creation (see src/data-access/workspaces.ts createWorkspace) always
-- sets this from the wizard's plain client-name textbox.

ALTER TABLE "workspaces" ALTER COLUMN "clientName" SET NOT NULL;
