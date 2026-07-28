# CLIENT_REVIEW_ARCHITECTURE.md

Architecture decisions for Phase 6 (secure client review portal, comments, change requests, file versions, approval). See `REVIEW_TOKEN_SECURITY.md` for the token's own security design, `MUTATION_ARCHITECTURE.md` for the Server Action/data-access patterns this phase reuses, and `FILE_STORAGE_ARCHITECTURE.md` for the Phase 5 upload/preview pipeline this phase extends rather than replaces.

## Why `Workspace.publicToken` was removed

Phase 3/4 added a plaintext `Workspace.publicToken`/`sharedAt` pair, unused by any real logic. It's incompatible with this phase's brief (hash-only storage, expiry, revocation, one-time reveal), so it was removed in this phase's migration rather than left as dead, misleading schema — `ReviewLink` replaces it entirely. The two creator list-view components that read `publicToken` to build a `/review/[token]` shortcut link (`workspace-card.tsx`, `workspace-table.tsx`) now show a non-clickable "Shared" indicator instead, since a raw token is never retrievable after creation and can no longer be persisted for a convenience link.

## Creator review-link lifecycle

`src/data-access/review-links.ts`, driven from `src/components/creator/review-link-panel.tsx` (replaces the Phase 4/5 disabled "Share Secure Link" placeholder) on `/workspaces/[id]`.

- **Create** (`createReviewLink`): ownership check, then eligibility (`assertReviewLinkEligible`) — not `CANCELLED`/`DELIVERED`, ≥1 non-deleted file, ≥1 file `READY` (covers both previewable images and locked PDF/ZIP deliverables — both reach `FileStatus.READY`), and no file left in `UPLOAD_PENDING`/`UPLOADING`/`UPLOADED`. If the workspace is still `DRAFT`, this call is what actually shares it: every current `READY` file version is marked `submittedAt = now()` and the workspace transitions `DRAFT → IN_REVIEW` through the centralized transition policy. Returns the raw token/expiry **once** — the Server Action (`createReviewLinkAction`) surfaces it in a one-time reveal panel; nothing persists it beyond that render.
- **Copy**: `useClipboardCopy()` in `review-link-panel.tsx` — `navigator.clipboard.writeText()` first, with an accessible fallback (a focused, selected read-only `<input>` the user can copy manually) when the Clipboard API throws (no permission, non-secure context, etc.). Never `localStorage`.
- **Revoke** (`revokeReviewLink`): finds the current `ACTIVE` link, sets `status: REVOKED`, `revokedAt: now()`. Effective immediately — `authorizeReviewToken` rejects a revoked link before checking anything else.
- **Regenerate** (`regenerateReviewLink`): creates a new link, then revokes the old one and sets its `replacedById` to the new link's id, in one transaction. The old token is never reused.
- **Display**: `getOwnedWorkspaceDetail` includes the most recent `ReviewLink` row (any status), with a **lazily-computed** display status — an `ACTIVE` row whose `expiresAt` has already passed is shown as `EXPIRED` even though nothing proactively flips the stored column (see `REVIEW_TOKEN_SECURITY.md` "Expiry").

## Client authorization

`src/data-access/review-auth.ts`'s `authorizeReviewToken(rawToken)` is a **separate trust path** from creator sessions (`src/auth.ts`/`requireAuthenticatedUser()`) — no cookie, no JWT, no reuse of Auth.js. It validates token shape, hashes, looks up by `tokenHash`, and checks status/expiry/workspace-availability, throwing one of four distinct error classes so callers (the page, the preview-url route, every client Server Action) can render/return the exact matching state without leaking *why* beyond a generic message. It returns a narrow `ReviewContext` — `{ reviewLinkId, workspaceId, workspace: {...safe fields...} }` — never a `User` row, never general creator access. See `REVIEW_TOKEN_SECURITY.md` for the full security rationale, including the explicit "identifies a reviewer with access to the link, not a verified individual" limitation.

Client-facing Server Actions (`src/actions/review.ts`) accept the raw token as a **hidden form field**, never a function argument bound from a URL param on the action itself, and re-run `authorizeReviewToken` on every single mutation — an expired/revoked token mid-session fails the very next action attempt, not just the initial page load.

## Comments and replies

`src/data-access/review-comments.ts`. One shared `createComment()` core, called by two narrow entry points (`addClientReviewComment` — token-authorized, unverified `reviewerName`/`reviewerEmail`; `addCreatorReviewComment` — session-authorized, server-derived creator identity) so both paths get identical validation:

- Body: trimmed, 1–2000 chars (`CommentValidationError` otherwise).
- Optional `workspaceFileId`/`fileVersionId`: re-verified to belong to the comment's own `workspaceId` — a caller (creator or client) can never smuggle a cross-workspace id through.
- Optional `parentId` (reply): the parent must exist **in the same workspace** and itself have `parentId === null` — replies are exactly one level deep; replying to a reply is rejected. This re-scoping happens inside `createComment` itself, not trusted from the caller, closing the "arbitrary cross-workspace parent id" gap the brief calls out.
- Pin coordinates (`pinX`/`pinY`): `validatePinCoordinates()` requires both-or-neither, each in `[0, 1]` — normalized, never raw pixels.
- **Resolve** (`resolveReviewComment`, creator-only, ownership resolved through the comment's own `workspaceId`): sets `status: RESOLVED`, `resolvedAt`, `resolvedById`. Never deletes the row.

Client comments surface in the creator's real Comments tab (`src/components/creator/comments-tab.tsx`) via `getOwnedReviewCommentThreads`, with inline reply/resolve controls following the same `useActionState` + Server Action pattern as every other mutation in this app.

**Rate limiting is explicitly deferred** — no attempt-throttling exists on comment/reply creation in this phase, matching Phase 5's equivalent, already-documented gap for upload-session creation (`FILE_STORAGE_ARCHITECTURE.md` "Security limitations"). A production deployment should add this before public exposure.

## Change-request workflow

`src/data-access/change-requests.ts`. `createChangeRequest`: requires the workspace be `IN_REVIEW` (via the centralized transition policy), refuses a second `OPEN` request without creating a duplicate (`ChangeRequestAlreadyOpenError` — a friendly, non-alarming result the UI can show, not treated as a hard failure), and — in one transaction — creates the `ChangeRequest` row and moves the workspace to `CHANGES_REQUESTED`. "Optionally reference open comments" is handled entirely client-side (the reviewer can tick open comments in the UI) plus a server-side quoted append into `summary` — no separate join table was added for what is fundamentally a text-composition affordance, keeping the schema to exactly what the brief's suggested models call for.

The creator sees the active request (`ChangeRequestBanner`, `src/components/creator/change-request-banner.tsx`) — summary, timestamp, reviewer — alongside the Files tab's per-file "Upload New Version" controls and the "Submit Revision for Review" action.

## File-version workflow

Extends, rather than duplicates, the Phase 5 upload pipeline (`src/data-access/uploads.ts`):

- `UploadSession.targetFileId` (nullable): unset = "new file" (Phase 5, unchanged). Set = "new version of this existing, owned file" — `createFileVersionUploadSession(fileId, ...)` is the version-scoped counterpart to `createUploadSession`, blocked (`FileVersionNotAllowedError`) once the workspace is `CANCELLED`/`DELIVERED` or already has a non-revoked `WorkspaceApproval` ("block destructive replacement after approval unless the approval is explicitly revoked" — a future, safe revocation workflow is Phase 7+ scope, not built here).
- `completeUploadSession` branches on `session.targetFileId`: the new-file path is untouched; the version path (`completeVersionUpload`) computes the next `versionNumber` via `MAX(versionNumber) + 1` inside the same transaction that creates the `FileVersion` row, with `@@unique([fileId, versionNumber])` as the race-safe backstop — a concurrent duplicate assignment fails the transaction outright rather than silently producing two same-numbered versions. Critically, it sets `WorkspaceFile.pendingVersionId`, **never** touching `currentVersionId`/`status` — the previous current version stays fully active and visible while the new one processes.
- The worker (`src/worker/job-processor.ts`) now checks `job.fileVersion.file.pendingVersionId === job.fileVersion.id` to distinguish a version-upload job from the original v1 path. On success, it atomically promotes (`currentVersionId = pendingVersionId; pendingVersionId = null`) in the same transaction that marks the job `COMPLETED`. On failure, it marks the candidate `FileVersion.status = FAILED` and leaves `currentVersionId`/`pendingVersionId` exactly as they were (`pendingVersionId` still points at the failed version, so the creator UI shows it) — the previous current version is never disturbed. Activity codes differ by path (`FILE_VERSION_PROCESSING_COMPLETED`/`FAILED` vs. the original `FILE_PROCESSING_COMPLETED`/`FAILED`).
- Every `FileVersion` also now carries its own `status` (`PROCESSING`/`READY`/`FAILED`) — generalizing what `WorkspaceFile.status` already tracked for a file's only version in Phase 5, now tracked per-version so an old `READY` version and a new `PROCESSING`/`FAILED` candidate can coexist without either disturbing the other.

## Revision submission

`src/data-access/revisions.ts`'s `submitRevision` is the **explicit** action that makes newly-uploaded versions client-visible — uploading a version alone never does. Requires: workspace `CHANGES_REQUESTED`, an `OPEN` `ChangeRequest`, at least one current version created after that request's `requestedAt`, and **no** file with a still-`PROCESSING`/`FAILED` pending version anywhere in the workspace. On success (one transaction): every not-yet-submitted current version gets `submittedAt = now()`, the `ChangeRequest` resolves, and the workspace returns to `IN_REVIEW`.

## Approval workflow

`src/data-access/approvals.ts`'s `approveWorkspace` — no payment, no unlocking, by design. Requires: `IN_REVIEW`, no `OPEN` `ChangeRequest`, no existing non-revoked `WorkspaceApproval` (prevents a duplicate/accidental second approval — returns `ApprovalAlreadyCompletedError`), and every submitted current version `READY` (never `PROCESSING`/`FAILED`). Builds an **immutable** `approvedFileVersionSnapshot` (file id, display name, version id, version number — a plain JSON array, never recomputed later) before the transaction, so a subsequent file change can never retroactively alter what was actually approved. Sets `status: APPROVED`, `Workspace.approvedAt` — explicitly never `PAID`, never `FILES_UNLOCKED`, never any original-file access grant.

The client-side approval amount is always `workspace.amount` read live from the database (via `authorizeReviewToken`'s `ReviewContext`) — never a hardcoded figure anywhere in the review portal.

## State transitions

`src/lib/workspace-transitions.ts` — the single source of truth every status-changing function in this phase (and Phase 4's pre-existing `cancelOwnedWorkspace`, now routed through the same table) calls through:

| From | Permitted to |
|---|---|
| `DRAFT` | `IN_REVIEW`, `CANCELLED` |
| `IN_REVIEW` | `CHANGES_REQUESTED`, `APPROVED`, `CANCELLED` |
| `CHANGES_REQUESTED` | `IN_REVIEW`, `CANCELLED` |
| `APPROVED` | `CANCELLED` only (Phase 7 will add `PAYMENT_PENDING`) |
| `PAYMENT_PENDING` | `CANCELLED` only |
| everything else (`PAID`/`FILES_UNLOCKED`/`DELIVERED`/`CANCELLED`) | nothing |

Cancellation intentionally remains reachable from any non-financially-locked status (matching the pre-existing `FINANCIAL_LOCK_STATUSES` rule from `MUTATION_ARCHITECTURE.md`) — `APPROVED`/`PAYMENT_PENDING` are not locked, only `PAID`/`FILES_UNLOCKED`/`DELIVERED` are. Every explicitly forbidden transition from the brief (`CANCELLED → IN_REVIEW`, `APPROVED → CHANGES_REQUESTED`, `APPROVED → DRAFT`, `DELIVERED → IN_REVIEW`) is simply absent from the allow-list, not special-cased — `src/lib/workspace-transitions.test.ts` asserts the full matrix directly.

## Deferred payment behavior

Nothing in this phase sets `PAYMENT_PENDING`, `PAID`, or `FILES_UNLOCKED`, generates a Razorpay order, or grants any original-file download access. The approval confirmation screen explicitly states payment "isn't available yet in this environment" and shows the amount due (from the database) alongside a permanent "Original files remain securely locked until payment is completed" notice — present on every review-portal screen, not only after approval. No code path in this phase can reach `WorkspaceFile`'s original storage key from the client review portal at all (`getReviewableFiles`/the preview-url route handler only ever resolve `previewStorageKey`, exactly mirroring the structural guarantee `FILE_STORAGE_ARCHITECTURE.md` already documents for the creator-facing preview endpoint).

## Review access and privacy

- `/review/[token]/page.tsx`: `export const dynamic = "force-dynamic"` (never statically cached), `generateMetadata()` returns `robots: { index: false, follow: false, nocache: true }` and `referrer: "no-referrer"`, and the page `<title>` is built from the resolved workspace title only — never the token.
- `src/app/robots.ts` disallows `/review/` for crawlers that respect `robots.txt`, as a second layer alongside the per-page directive.
- The review portal has **no sitemap entry** — no `sitemap.ts` exists in this app at all (nothing to exclude from).
- `Workspace.creator`'s exposed identity is limited to `creator.name` (`ReviewContext.workspace.creatorName`) — never email, never any other `User` field.

## Error and system states

`src/components/review/review-system-state.tsx` wraps the existing `SystemStateLayout` primitive with review-appropriate actions (never a "Return to Creator Dashboard" link — a client here has no creator account). `/review/[token]/page.tsx` maps every `authorizeReviewToken` failure mode, plus a "no files available yet" case, to a distinct screen; the reused `/link-expired`/`/link-revoked` static routes from Phase 1 remain unchanged (still reachable directly, still valid generic destinations) while the token-driven page now renders its own instances of the same visual states inline. Comment-submission/change-request/approval failures render as inline form errors (never a full-page navigation) via each Server Action's `{ error }` return.

## Rate limiting (deferred, documented)

As with Phase 5's upload-session creation, no request-level throttling exists anywhere in the Phase 6 surface (comment posting, change-request submission, approval attempts, preview-url issuance). The per-workspace/per-file business-rule guards (single active change request, single non-revoked approval, file-count/size limits already established in Phase 5) bound the *accepted* damage from repeated submissions, but not the request volume itself. Documented here as a known gap, not silently assumed away, per the brief's explicit instruction.
