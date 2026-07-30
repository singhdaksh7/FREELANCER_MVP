# REVIEW_TOKEN_SECURITY.md

Security design for the Phase 6 secure client-review token — the credential a client (with no creator account) uses to open `/review/[token]`. See `CLIENT_REVIEW_ARCHITECTURE.md` for the full workflow this token gates.

## Token entropy

- `src/lib/review-token.ts`'s `generateReviewToken()` calls `node:crypto`'s `randomBytes(32)` — **256 bits of cryptographically secure randomness**, base64url-encoded (~43 characters, alphabet `[A-Za-z0-9_-]`).
- Never derived from a database id, a timestamp, a counter, or any other predictable/enumerable source. `ReviewLink.id` (a cuid, sequential-ish) and the token are completely independent values — even full knowledge of every `ReviewLink.id` in the database gives an attacker no information about any token.
- `isValidReviewTokenShape()` rejects anything not matching the expected base64url shape/length **before any database access** — a request with a malformed token never reaches Postgres at all.

## Hash-at-rest policy

- Only `hashReviewToken(rawToken)` — a SHA-256 hex digest — is ever written to `ReviewLink.tokenHash` (`@unique`). The raw token itself is **never persisted anywhere**: not in this row, not in any other table, not in `ActivityLog.metadata`, not in a `.env` file, not in a config value.
- `authorizeReviewToken(rawToken)` (`src/data-access/review-auth.ts`) is the only function that ever sees a raw token; it hashes it immediately and looks the link up by `tokenHash` via Prisma's unique index — the comparison a database index performs is not a byte-by-byte secret comparison in application code, so there's no meaningful timing side-channel to defend against there. `src/lib/review-token.ts` additionally exports `hashesEqual()` (Node's `crypto.timingSafeEqual`) as defense-in-depth for any future code path that ends up comparing two hash values directly in application memory, per the brief's "use constant-time comparison where applicable" — not currently on the primary lookup path, which doesn't need it.
- `ReviewLink.tokenPrefix` stores only the raw token's **first 8 characters** — enough for a support agent to help a creator identify "which link" in conversation, nowhere close to enough (out of 256 bits) to reconstruct or brute-force the full token.
- A creator that loses the link has no way to retrieve it again — `createReviewLinkAction`/`regenerateReviewLinkAction` return the raw token exactly once, in the Server Action's response, rendered client-side and never written to `localStorage`/`sessionStorage`/a cookie/any persistent client-side store. The only remedy is **regeneration**, which issues a brand-new token and immediately revokes the old one.

## Expiry

- Every `ReviewLink` gets an `expiresAt` at creation, `REVIEW_LINK_EXPIRY_DAYS` (default 30) days out (`getReviewLinkConfig()`, `src/storage/storage-config.ts`).
- Expiry is checked **lazily** at authorization time (`authorizeReviewToken`), not via a background sweep — `link.expiresAt <= new Date()` is treated as expired regardless of the stored `status` value. This means an `ACTIVE` row past its `expiresAt` is correctly rejected even though nothing has proactively flipped its `status` column to `EXPIRED` in the database; `getOwnedWorkspaceDetail`'s creator-facing summary applies the same lazy check when deciding what status to display.

## Revocation

- `revokeReviewLink(workspaceId)` sets `status: "REVOKED"`, `revokedAt: now()`. `authorizeReviewToken` rejects a `REVOKED` link unconditionally, before even checking `expiresAt` — revocation always wins.
- Revocation takes effect **immediately** on the very next request; there is no cache or grace period.

## Regeneration

- `regenerateReviewLink(workspaceId)`: in one transaction, creates a brand-new `ReviewLink` (new random token, new hash), then revokes the previous `ACTIVE` link and sets its `replacedById` to the new link's id (a self-referential, one-to-one pointer — purely a historical "this was replaced by that" trail, not itself security-relevant).
- The old token is never reused as, or folded into, the new one — they are two fully independent 256-bit values.

## URL and browser-history limitations (honest disclosure)

- The token lives in the URL path (`/review/<token>`). Like any bearer token carried in a URL, it can end up in:
  - **Browser history** on a shared/public computer.
  - **Referrer headers** sent to third-party resources the review page itself loads — mitigated here by setting `referrer: "no-referrer"` in the page's metadata, but this cannot control what a *client's* browser extensions or a corporate proxy might still log.
  - **Server access logs** of any intermediary (corporate proxy, ISP, hosting provider's own request logs) that log full request paths — this application's own server-side code never intentionally logs the token (see "Logging and redaction" below), but it cannot control infrastructure outside this codebase.
- This is a structural property of any path-based bearer-token link design, not something this implementation claims to fully solve. The mitigations here are: short default expiry (30 days, configurable), one-click revocation, and no server-side logging of the token — not elimination of the browser-history/referrer exposure itself.

## Link-forwarding risk

- Anyone who receives the link (forwarded email, screenshot, shared chat) gains the same access as the intended recipient. **Possession of the link is treated as "a reviewer with access to the link," never as proof of a specific person's identity** — see "Identity limitations" below.
- There is no per-recipient token, no email-bound verification, and no session/device binding in this phase. A creator concerned about forwarding should revoke and regenerate rather than treat the original link as recoverable-but-restricted.

## Logging and redaction

- `authorizeReviewToken`'s thrown errors (`InvalidReviewTokenError`, `ReviewLinkExpiredError`, `ReviewLinkRevokedError`, `WorkspaceUnavailableError`) carry only a static, generic message — never the token, never a reason more specific than "this link is not valid" is shown to the browser.
- `console.error` calls in the review code paths (`page.tsx`'s catch-all, the preview-url route handler) log the *error object*, never the raw token string, and never any raw request body containing it.
- `ActivityLog.metadata` for every `REVIEW_LINK_*` action stores `tokenPrefix` only (see `ActivityMetadata` in `src/lib/activity-log.ts`) — the type has no `token`/`rawToken` field at all, so a future accidental `metadata: { token }` would be a type error, not a silent leak. `src/lib/activity-log.test.ts` documents this contract directly.
- `generateMetadata()` for `/review/[token]/page.tsx` never interpolates the token into the page `<title>` — only the resolved workspace title (or a generic fallback on any authorization failure, so a failed lookup can't be distinguished from a real one by title alone either).

## Cache controls

- `/review/[token]/page.tsx` sets `export const dynamic = "force-dynamic"` — never statically rendered or cached by Next.js's build-time/ISR cache; every request re-authorizes the token from the database.
- `generateMetadata()` returns `robots: { index: false, follow: false, nocache: true }` — both a crawler directive and a `noarchive`-style signal against search-engine caching.
- The token-authorized preview-url route handler (`/api/review/[token]/files/[fileId]/preview-url`) issues a presigned URL with the same 60-second expiry as the creator-facing preview endpoint (`src/storage/signed-urls.ts`'s `PREVIEW_URL_EXPIRY_SECONDS`) — never a long-lived or publicly cacheable URL.
- `src/app/robots.ts` additionally disallows `/review/` for crawlers that respect `robots.txt`, as a second, defense-in-depth layer alongside the page-level `noindex` (a crawler that ignores `robots.txt` still sees the per-page directive).

## Identity limitations

**A valid, unexpired, non-revoked token identifies "a reviewer with access to this link" — it is not a cryptographic assertion about who that person actually is.** Nothing in this phase verifies:

- That the person using the link is the intended client.
- That a `reviewerName`/`reviewerEmail` entered in a comment, change request, or approval form is accurate — these are stored exactly as-submitted and are never cross-checked against `Workspace.client`'s on-file email.
- That the link hasn't been forwarded, screenshotted, or otherwise shared beyond its intended recipient.

Every place this matters in the UI/data model says so explicitly: `ReviewComment.reviewerName`/`reviewerEmail` and `WorkspaceApproval.reviewerName`/`reviewerEmail` are documented in `prisma/schema.prisma` as client-entered, unverified fields, and `ActivityLog` rows for client-triggered actions use `actorType: "CLIENT"` (never conflated with an authenticated `User`).

## Future optional email verification (not implemented)

A natural, non-breaking hardening path for a later phase: an optional one-time email verification step tied to `Workspace.client.email` — e.g., requiring the reviewer to confirm a code sent to the on-file client email before the portal unlocks comment/approval actions (read-only preview access could remain ungated). This is **explicitly out of scope for Phase 6** (the brief's deferred-features list excludes OTP client verification and email delivery entirely) and nothing here should be read as implying it exists. If added later, it should layer on top of `authorizeReviewToken` — a second, independent check — rather than replacing the token model, since the token remains the mechanism that scopes access to one specific workspace.
