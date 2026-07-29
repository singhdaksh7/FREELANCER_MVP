# Requirements Alignment (Phase 7.5)

Maps each stakeholder-agreed MVP requirement to what was actually built.
Detailed architecture for the larger areas lives in its own document
(linked below) — this file is the index and the completion checklist.

## 0. Phase 7 security gate

All six closure conditions were re-verified before any Phase 7.5 work
began; two were found violated and fixed first:

| Condition | Status | Fix |
|---|---|---|
| `WorkspaceApproval` stores immutable `approvedAmount`/`approvedCurrency` | Already true | — |
| Payment-order creation uses the approval amount, not editable `Workspace.amount` | Already true | — |
| Amount/currency editing blocked after `APPROVED` | **Was violated** — only locked from `PAID` onward | `AMOUNT_LOCK_STATUSES` added (`src/data-access/workspaces.ts`), now includes `APPROVED`/`PAYMENT_PENDING`/`AWAITING_CREATOR_RELEASE`/`CLOSED` |
| No raw download token in Postgres/logs/activity | Already true | — |
| Download grants store only a token hash + prefix | Already true | — |
| Payment/download tests exist and pass | **Was violated** — `payment-workflow.integration.test.ts` referenced a removed `rawTokenOnce` field and failed `tsc` | Updated to the current claim-based (`claimDownloadSession`) flow |

## 1. Inline client creation

`InlineClientModal` (portaled to `<body>` — see implementation note below)
inside the workspace wizard's Step 1 Client field. `createInlineClientAction`
→ `createClient(input, { source: "INLINE_WIZARD" })`
(`src/data-access/clients.ts`) — same `clientSchema` validation and
mutation layer as `/clients/new`, `creatorId` always derived from the
session. Writes both `CLIENT_CREATED` and `INLINE_CLIENT_CREATED` activity
entries. New client is appended to the wizard's in-memory selector and
auto-selected; the rest of the wizard's draft state is untouched.

**Implementation note:** the wizard is itself one `<form>`; a naive
`<dialog><form>` nested inside it is invalid HTML and silently 404s on
submit (the browser resolves the inner submit against the outer form's
action). Fixed by portaling the dialog to `document.body` via
`createPortal`, discovered and fixed via the Playwright test below.

- Route/component: `src/components/creator/workspace-wizard.tsx`,
  `inline-client-modal.tsx`.
- DB model: `Client` (no schema change).
- Tests: `src/data-access/mutations.integration.test.ts` (inline creation +
  cross-creator rejection), `e2e/mutations/mutations.spec.ts` ("creates a
  client inline during workspace creation, without leaving the wizard").
- Deferred: none — fully implemented.

## 2–5. Delivery modes, wizard, master link, version-specific conversations

See **DELIVERY_MODES.md** for modes/workflows/wizard validation, and the
"Master review link behaviour" section below for the link itself.

Version-specific conversations: `ReviewComment.fileVersionId` is now
surfaced end-to-end (`ReviewCommentThreadItem.fileVersionId`), the client
portal filters to the active file+version (`ReviewCommentsPanel`'s
`versionComments`) with workspace-level general comments in their own
section, and the creator Comments tab (`CommentsTab`) filters by
File/Version/Open/Resolved. Replies always inherit the parent's
file/version (enforced server-side in `createComment`, not just in the
UI).

- Route/component: `review-comments-panel.tsx`, `comments-tab.tsx`.
- DB model: `ReviewComment` (existing `fileVersionId` column, now used).
- Tests: `review-workflow.integration.test.ts`'s "keeps version 1 and
  version 2 conversations isolated" test — creates v1/v2 comments + a
  reply, asserts the reply inherits v1's version even though v2 is
  current, and that filtering by version returns disjoint sets.
- Deferred: none for the core requirement.

### Master review link behaviour

`ReviewLink.expiresAt` is nullable in the schema (already true before this
phase) but `createReviewLink`/`regenerateReviewLink`
(`src/data-access/review-links.ts`) **never actually created a
project-duration link** — every link still got a fixed
`REVIEW_LINK_EXPIRY_DAYS` (default 30) expiry. Fixed: `expiryDays` now
defaults to `null` (project-duration) via `getReviewLinkConfig()`
(`src/storage/storage-config.ts`), with `REVIEW_LINK_EXPIRY_DAYS` as an
opt-back-in override. Revoke/regenerate (already existing, unmodified) and
the read-only-after-completion behavior (see DELIVERY_MODES.md) still
apply. UI copy never calls it "permanent" — see
`review-link-panel.tsx`. A `REVIEW_LINK_RETENTION_DAYS` config value
(default 180) is added and referenced in the UI copy; **no automated
retention/cleanup job runs yet** — it's informational only in this phase.

- Tests: `src/data-access/review-links.test.ts` ("creates a
  project-duration link (expiresAt null) by default"),
  `storage-config.test.ts`.
- Deferred: automated retention-period enforcement (deletion job).

## 6. Numbered image pin comments & 9. Simple image doodle annotations

See **IMAGE_ANNOTATION_ARCHITECTURE.md**.

## 7–8. 2% platform fee & freelancer payable ledger, test-mode payout simulation

See **PLATFORM_FEE_AND_PAYOUT_LEDGER.md**.

## 10. Minimal support-ticket and dispute workflow, 15. Minimal admin portal

See **SUPPORT_AND_DISPUTE_ARCHITECTURE.md** and **ADMIN_ARCHITECTURE.md**.

## 13. KYC and bank-account placeholders

`/settings` (`src/app/(creator)/settings/page.tsx`) shows only
informational states, no form: "Test mode active" (with the configured
`PAYOUT_HOLD_HOURS`), "Verification required for live payouts," and "Live
payouts unavailable." Nothing is collected — see
PLATFORM_FEE_AND_PAYOUT_LEDGER.md.

## 16. Activity and audit events

All the events listed in the phase brief were added to
`src/lib/activity-log.ts`'s `ActivityAction` + `formatActivityLabel`:
`INLINE_CLIENT_CREATED`, `DELIVERY_MODE_SELECTED`, `REVIEW_LINK_ARCHIVED`*,
`REVIEW_LINK_READ_ONLY`, `FILES_RELEASED`, `WORKSPACE_CLOSED`,
`IMAGE_PIN_ADDED`, `IMAGE_ANNOTATION_ADDED`, `PAYMENT_BREAKDOWN_CREATED`,
`FREELANCER_PAYABLE_CREATED`, `PAYOUT_AVAILABLE`, `PAYOUT_PROCESSING`,
`PAYOUT_COMPLETED`, `PAYOUT_FAILED`, `SUPPORT_TICKET_CREATED`,
`SUPPORT_TICKET_REPLIED`, `SUPPORT_TICKET_STATUS_CHANGED`,
`SUPPORT_TICKET_RESOLVED`. `REVIEW_LINK_READ_ONLY` fires from both places
the portal actually becomes read-only: `closeWorkspaceForReview`
(PREVIEW_ONLY → CLOSED) and `downloadOriginalFile`/`downloadBundle`'s
first-download → DELIVERED transition (`src/data-access/downloads.ts`).

\* `REVIEW_LINK_ARCHIVED` is defined (with formatter copy) but has no
write call site — there is no "archive" action distinct from
revoke/regenerate/close in this phase's UI, so nothing currently triggers
it. Kept for a future phase that adds an explicit archive action.

No raw token, payment secret, identity-document value, bank data, webhook
secret, storage key, or unfiltered form payload is ever written to
`ActivityLog.metadata` — every metadata field is a named, typed field on
`ActivityMetadata`.

## 21. Validation targets

See the completion report (delivered separately in this session) for the
actual `lint`/`tsc`/`test`/`test:integration`/`build` results. Summary:
0 lint errors/warnings, 0 TypeScript errors, all unit tests passing (477),
all integration tests passing (79), production build succeeds.

## Deferred stakeholder requirements (explicit, not silent)

- Live Razorpay Route/marketplace transfers, real bank transfers, real
  KYC, PAN/Aadhaar collection, GST invoices, refunds, chargebacks, real
  escrow, video (upload/playback/transcoding/watermarks/timestamp
  comments), audio, PDF visual preview, subscriptions, storage-plan
  enforcement, agency teams, white-label, custom domains, public
  freelancer profiles/ratings/trust scores/leaderboards, AI watermark
  detection — all explicitly out of scope per the phase brief, and none
  were implemented.
- `/admin/users`, `/admin/workspaces`, `/admin/payments` per-row browsing
  (dashboard aggregates cover the required summary figures).
- `REVIEW_LINK_ARCHIVED`/`REVIEW_LINK_READ_ONLY` activity-event wiring
  (behavior is enforced; the audit-trail entry for it is not yet written).
- Automated retention-period cleanup job for closed/delivered projects.
- Full Playwright/visual-baseline suite for every flow listed in the phase
  brief — a representative subset was added this session (inline client
  creation); the remainder (delivery-mode flows, pin/annotation capture,
  fee breakdown, admin screens, support tickets) has real integration-test
  coverage but not yet browser-level E2E coverage. See each feature's own
  test-coverage section above/in the linked docs for exactly what exists.

## Remaining business decisions

- Gateway-fee policy (who bears Razorpay's own processing fee) — tracked
  separately (`PaymentBreakdown.gatewayFeeSubunits`), never silently
  deducted until stakeholders decide.
- Whether/when to build a live payout provider integration (marketplace or
  direct bank transfer), which unblocks real KYC collection.
- Formal data-retention policy for closed/delivered projects (currently a
  configured-but-unenforced number of days).
