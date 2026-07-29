# SECURE_DOWNLOAD_ARCHITECTURE.md

Architecture decisions for Phase 7's secure original-file delivery — the delivery-bundle worker, download grants, and the `/download/[token]` hub. See `PAYMENT_ARCHITECTURE.md` for the payment flow this is gated behind, and `FILE_STORAGE_ARCHITECTURE.md` for the Phase 5 storage abstraction this extends.

## Delivery snapshot

A `DeliveryBundle` is built **only** from the exact `WorkspaceApproval.approvedFileVersionSnapshot` that was frozen at approval time (see `CLIENT_REVIEW_ARCHITECTURE.md`) — never a live re-query of "the workspace's current files." `src/worker/delivery-job-processor.ts`'s `processDeliveryJob` re-validates every snapshot entry against the database before trusting it: each `fileVersionId` must still exist, belong to the exact `workspaceFileId` recorded in the snapshot, belong to this workspace, and its parent file must not be soft-deleted. A file deleted after approval but before payment cannot silently disappear from (or corrupt) the delivery — it fails the whole job loudly instead (see "Failure handling").

## ZIP worker

`src/worker/process-deliveries.ts` (`npm run worker:deliveries` / `worker:deliveries:once`) — a standalone, long-lived process, structurally identical in shape to Phase 5's file-processing worker (`FILE_STORAGE_ARCHITECTURE.md`), never part of the Next.js request/response cycle:

1. Atomically claims one `PENDING` `DeliveryBundleJob` via `FOR UPDATE SKIP LOCKED` (`claimNextDeliveryJob`) — safe for multiple concurrent worker instances.
2. Re-validates the approval snapshot (above).
3. Downloads every approved original from private storage (`s3StorageProvider.getObjectBuffer`).
4. Builds a ZIP in memory (`jszip`) with entry names from `src/lib/zip-entry-name.ts`'s `buildUniqueZipEntryNames` — every name is passed through `sanitizeDisplayFileName` (strips path separators/unsafe characters, same sanitizer Phase 5 uses for display filenames) and de-duplicated with a `(1)`, `(2)`, … suffix before the extension. **No ZIP entry can ever contain `../`, an absolute path, or a directory separator** — every entry is a single flat filename by construction, not by validation after the fact.
5. Uploads the ZIP privately under the `deliveries/` prefix (configurable via `DELIVERY_BUNDLE_PREFIX`) with a 192-bit random key (`generateDeliveryBundleKey` — same entropy/randomness convention as every other storage key in this app; never derived from a database id).
6. Computes a SHA-256 checksum (`sha256Hex`) and records size/checksum/`storageKey` on `DeliveryBundle`.
7. In one transaction: marks the bundle `READY`, creates **one** `DownloadGrant` + its `DownloadGrantFile` snapshot rows, transitions the workspace `PAID -> FILES_UNLOCKED`, and records `FILES_UNLOCKED` activity.

ZIP creation never runs inside a route handler or page render — only inside this worker process.

## Grant entropy

`src/lib/download-token.ts` mirrors `src/lib/review-token.ts`'s scheme exactly, as a **fully independent token space**: `randomBytes(32)` (256 bits), base64url-encoded. A download token is never derived from, or interchangeable with, a review token — `authorizeDownloadGrant` only ever looks up `DownloadGrant.tokenHash`, which a review token's hash will never match (see `payment-workflow.integration.test.ts`'s "a review token must never work as a download token" case).

## Hash-at-rest policy

Only `hashDownloadToken(rawToken)` (SHA-256 hex) is ever written to `DownloadGrant.tokenHash` (`@unique`). `DownloadGrant.tokenPrefix` stores only the first 8 characters, for support identification — nowhere close to enough to reconstruct the token.

### Handoff without email

Email delivery is explicitly out of scope for this phase (see the Phase 7 brief's deferred-features list), which creates a real question: the delivery worker generates the raw download token, but has no HTTP response to hand it back through. The resolution: `DownloadGrant.rawTokenOnce` holds the raw token **transiently** — written by the worker at grant-creation time, read and immediately nulled by `revealDownloadUrlOnce` (`src/data-access/downloads.ts`) the first time the client's own token-authorized review-portal polling (`GET /api/review/[token]/payments/status`) observes `FILES_UNLOCKED`/`DELIVERED`. This is a deliberate, narrow, documented exception to "hash only" — the raw token is never logged, never written to `ActivityLog.metadata`, never returned by any creator-facing endpoint, and exists in the database only until the first authorized read. Once the client's browser has the `/download/[token]` URL (address bar/history), it needs nothing further from this mechanism. A future phase adding email delivery should send the link directly from the worker and can remove `rawTokenOnce` entirely at that point.

## Expiry

`DOWNLOAD_GRANT_TTL` (default 14 days) from grant creation. Checked **lazily** at authorization time (`authorizeDownloadGrant`), independent of the stored `status` column — an `ACTIVE` row past `expiresAt` is rejected as `DownloadGrantExpiredError` regardless.

## Limits

`DOWNLOAD_GRANT_MAX_DOWNLOADS` (default 20) — a shared budget across both individual-file and bundle downloads. `src/data-access/downloads.ts`'s `claimOneDownload` re-checks `downloadCount < maxDownloads` **fresh, inside its own transaction**, immediately before incrementing — never trusts the `DownloadContext` snapshot a caller may be holding, which could be stale by the time the actual download request lands (e.g., two tabs downloading concurrently). The counter flips the grant to `EXHAUSTED` in the same update once it reaches the limit.

## Original authorization

`GET /api/download/[token]/files/[fileId]` (`src/app/api/download/[token]/files/[fileId]/route.ts`):

1. Hashes and authorizes the grant (`authorizeDownloadGrant`).
2. Requires `fileId` to match one of **this grant's own** `DownloadGrantFile` rows — a newer, unapproved version, or a different workspace's file, is `FileNotInGrantError` (see the integration test's "cross-workspace file access fails" case).
3. Atomically records the download + increments the counter (`claimOneDownload`) — a failed authorization (expired/revoked/exhausted/wrong file) is **never** counted as a download.
4. Redirects (`302`) to a 60-second presigned S3 GET URL with a signed `Content-Disposition: attachment` header (`buildContentDisposition`, `src/lib/filename-sanitize.ts`) — an ASCII fallback plus an RFC 5987 `filename*=UTF-8''...` for full Unicode support. `originalStorageKey` itself is never exposed in any response.

`GET /api/download/[token]/bundle` is the same authorization/counting path, gated additionally on `DeliveryBundle.status === "READY"` — a pending/processing/failed bundle returns a safe `202`/`BundleNotReadyError`, never an empty or partial ZIP.

A review token can never reach either endpoint — `authorizeDownloadGrant` only recognizes `DownloadGrant.tokenHash`, an entirely different table/token space from `ReviewLink.tokenHash`.

## Download logging

One `DownloadLog` row per **successful, counted** download (`downloadType: INDIVIDUAL | BUNDLE`), with a hashed IP (`sha256`, never raw — see "Privacy" below) and the requesting user agent. A rejected authorization attempt (expired/revoked/exhausted/wrong file) is never logged as a download — see `claimOneDownload`'s re-check happening strictly before any log/counter write.

### Privacy

`ipHash` is a SHA-256 hash of the raw client IP (from `X-Forwarded-For`/`X-Real-IP`, best-effort) — the raw IP itself is never persisted. This mirrors `src/lib/rate-limit.ts`'s `networkScopedIp` privacy stance for rate-limit identifiers, applied here to the audit log instead.

## DELIVERED definition

**"Secure original delivery access has been exercised at least once."** Set by `claimOneDownload` the first time any individual-original or bundle download is successfully authorized and counted for a `FILES_UNLOCKED` workspace — transitioned through the centralized policy (`FILES_UNLOCKED -> DELIVERED`, `src/lib/workspace-transitions.ts`). A workspace that reaches `FILES_UNLOCKED` but whose client never actually downloads anything stays `FILES_UNLOCKED` indefinitely — `DELIVERED` is never inferred from payment or bundle-readiness alone.

## Revocation

Not exposed via any creator UI in this phase (only the failed-delivery **retry** action is — see `PAYMENT_ARCHITECTURE.md`'s "creator retry action only for failed delivery preparation"), but the data model and `authorizeDownloadGrant` fully support it: setting `DownloadGrant.status = "REVOKED"` takes effect immediately on the next authorization check (checked before expiry, same precedence as `ReviewLink` revocation in `REVIEW_TOKEN_SECURITY.md`). A future phase can add a creator-facing "revoke download access" action with zero data-model changes.

## Failure handling

If delivery preparation fails (missing original object, corrupt approval snapshot, storage outage, or any other `processDeliveryJob` exception):

- `DeliveryBundle.status` and `DeliveryBundleJob.status` are both set `FAILED`, with a safe `processingError` summary (never a raw AWS SDK/Prisma error) and a `DELIVERY_PREPARATION_FAILED` activity entry.
- The workspace **stays `PAID`** — never `FILES_UNLOCKED`, and payment truth (`Payment.status = "PAID"`) is completely untouched.
- The client sees a "Your payment succeeded — preparing your files hit a snag, the creator has been notified" state (`PaymentPanel`'s `preparation_failed` phase) — never an instruction to pay again.
- The creator sees a "Retry" action on the workspace Payment tab (`retryDeliveryPreparationAction` → `src/data-access/delivery-retry.ts`), bounded by `DELIVERY_WORKER_MAX_ATTEMPTS` — each retry creates a **new** `DeliveryBundleJob` row (one row per attempt, same convention as Phase 5's `FileProcessingJob`), never mutates the failed one in place.
