# Retention Policy (Phase 7.5 — documented, not enforced)

Data-retention *enforcement* for completed projects is explicitly deferred
to a future phase. This document records the current (unenforced)
behavior, exactly what a future cleanup job would touch, and the safety
properties it must have before it's allowed to run — so the gap is a
documented decision, not a silent omission.

## Current behavior

Nothing is ever automatically deleted. Once a `Workspace` reaches a
terminal status (`DELIVERED` or `CLOSED`), its rows and associated storage
objects are retained indefinitely:

- The `Workspace` row itself, and every `WorkspaceFile`/`FileVersion` row
  (soft-deleted files keep their row and audit trail — see
  `FILE_STORAGE_ARCHITECTURE.md` — only the storage object is removed on
  an explicit delete, never on a timer).
- Original and preview objects in storage (MinIO/S3), addressed by
  `FileVersion.originalStorageKey`/`previewStorageKey`.
- `ReviewLink` rows. `REVIEW_LINK_RETENTION_DAYS` (`src/storage/storage-config.ts`,
  default 180) is a **configured, UI-surfaced number only** — it drives the
  copy shown in `review-link-panel.tsx`, but nothing reads it to actually
  expire or delete a link. A link's `expiresAt` is independently
  project-duration (`null`) by default (see §"Master review link
  behaviour" in `REQUIREMENTS_ALIGNMENT.md`) and is otherwise unaffected
  by this constant.
- `Payment`, `PaymentBreakdown`, `DownloadGrant`, `DeliveryBundle`,
  `ActivityLog`, and `PayoutLedgerEntry` rows — financial and audit
  records are never candidates for deletion under any future policy this
  document anticipates; they're listed here only because a cleanup job
  touching a workspace's files must not cascade into them.

## What a future cleanup job would touch

Scoped strictly to storage reclamation and stale-row pruning for projects
that are both terminal (`DELIVERED`/`CLOSED`) *and* older than a
configured retention window past that terminal transition:

- Delete the original/preview objects in storage for that workspace's
  `FileVersion` rows (the expensive part — storage cost, not database
  cost).
- Optionally null out or archive the now-orphaned `storageKey` columns so
  a stale key is never re-served (see `SECURE_DOWNLOAD_ARCHITECTURE.md`
  for why a dangling key is dangerous if storage bucket names/paths are
  ever reused).
- Never delete the `Workspace`, `Client`, `Payment`, `ActivityLog`, or
  `PayoutLedgerEntry` rows themselves — those are the durable business
  record; only large binary storage objects are reclaimed.

## Required safety properties before this job may run automatically

1. **Idempotent** — running it twice on the same workspace must be a
   no-op the second time, not an error or a double-delete attempt.
2. **Dry-run mode by default** — must support listing exactly what it
   would delete without deleting anything, and that output must be
   reviewable (logged/exported) before the first real run in production.
3. **Never touches a workspace with an open `SupportTicket`** (any status
   other than `RESOLVED`/`CLOSED`) — a dispute in progress can depend on
   the original files being retrievable.
4. **Audit-logged** — every deletion writes its own `ActivityLog` entry
   (actor `SYSTEM`, safe structured metadata only, same convention as
   every other write in this codebase — see `REQUIREMENTS_ALIGNMENT.md`
   §16) so "why did this file disappear" is always answerable.
5. **Configurable, explicit retention window** — not a hardcoded number;
   must reuse (or replace) `REVIEW_LINK_RETENTION_DAYS` rather than
   introducing a second, inconsistent constant.
6. **Reversible within a grace period** — storage deletion should not be
   the very first action; a soft-delete/quarantine step with its own
   shorter, separately-configured grace window is the safer design so an
   operator error is recoverable.

## Why nothing destructive runs today

No automated deletion path exists anywhere in the codebase — not behind a
flag, not disabled, not scheduled-but-inert. Building a *partial* job now
(e.g. one missing the dispute check or the dry-run mode) would be worse
than building none: it would look done while missing exactly the
properties that make deleting a freelancer's paid deliverables safe.
Shipping this deferred, and documenting the shape it must take, keeps the
gap visible and intentional rather than something a future contributor
discovers by reading code that "looks finished."

`REVIEW_LINK_ARCHIVED` (the activity-log event) stays unemitted for the
same reason in miniature: there is no "archive" UI action distinct from
revoke/regenerate/close today, so nothing should synthesize a fake call
site just to exercise an event that doesn't correspond to a real feature
yet.
