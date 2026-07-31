-- Phase 8 — step 5 of 5. PREVIEW_ONLY is retired from the product (see
-- DELIVERY_MODES.md). Convert every existing PREVIEW_ONLY workspace to
-- APPROVAL_ONLY, the closest surviving mode (client review/comment
-- without payment). The enum value "PREVIEW_ONLY" itself is left in
-- place in Postgres — dropping an enum value is not a safe forward-only
-- operation — but the application layer (src/validation/workspace.ts)
-- never accepts it again.

UPDATE "workspaces"
SET "deliveryMode" = 'APPROVAL_ONLY'
WHERE "deliveryMode" = 'PREVIEW_ONLY';
