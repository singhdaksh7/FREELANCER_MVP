-- Phase 8 — step 2 of 5. Backfill every existing workspace's clientName
-- snapshot from its currently-related Client row. Idempotent (only fills
-- rows still NULL) and safe to run against the live Neon database.

UPDATE "workspaces" w
SET "clientName" = c."name"
FROM "clients" c
WHERE w."clientId" = c."id"
  AND w."clientName" IS NULL;

-- Defensive fallback: any workspace somehow left without a resolvable
-- Client (should not exist under the current schema, but guards against
-- orphaned data) gets a neutral placeholder instead of leaving NULL,
-- since the very next migration makes this column NOT NULL.
UPDATE "workspaces"
SET "clientName" = 'Unknown Client'
WHERE "clientName" IS NULL;
