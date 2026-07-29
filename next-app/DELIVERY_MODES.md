# Delivery Modes (Phase 7.5)

Every workspace has exactly one `DeliveryMode`, set at creation and immutable
afterward: `PAYMENT_REQUIRED` (default), `APPROVAL_ONLY`, or `PREVIEW_ONLY`.
The mode governs the entire workflow, the transition table
(`src/lib/workspace-transitions.ts`), what the review portal shows the
client, and whether a payment or a file release ever happens.

None of the three modes are described as "escrow" anywhere in the product —
that word is deliberately avoided.

## PAYMENT_REQUIRED

> "Your client reviews and approves the work, completes payment, and then
> receives the approved original files."

```
IN_REVIEW → APPROVED → PAYMENT_PENDING → PAID → FILES_UNLOCKED → DELIVERED
```

- `APPROVED → PAYMENT_PENDING` happens when the client creates a Razorpay
  order (`src/data-access/payment-orders.ts`).
- `PAYMENT_PENDING → PAID` happens only inside the one idempotent
  finalization service, `finalizeCapturedPayment`
  (`src/data-access/payment-finalization.ts`), called from the webhook route
  and from reconciliation — never from anywhere else.
- Amount/currency are frozen onto `WorkspaceApproval.approvedAmount`/
  `approvedCurrency` at approval time and are the only source
  `createPaymentOrder` ever reads from (see PAYMENT_ARCHITECTURE.md).
  `Workspace.amount`/`currency` are locked (`AMOUNT_LOCK_STATUSES` in
  `src/data-access/workspaces.ts`) from `APPROVED` onward.
- A `PaymentBreakdown` (2% platform fee) is frozen at order-creation time —
  see PLATFORM_FEE_AND_PAYOUT_LEDGER.md.
- Delivery bundle + secure download grant are created by
  `finalizeCapturedPayment` and processed by
  `src/worker/delivery-job-processor.ts`, exactly as in Phase 7.

## APPROVAL_ONLY

> "Your client reviews and approves the work. You decide when to release the
> original files. No online payment is collected."

```
IN_REVIEW → APPROVED → AWAITING_CREATOR_RELEASE → FILES_UNLOCKED → DELIVERED
```

- There is no client-driven step between approval and release (unlike
  `PAYMENT_REQUIRED`, where creating a payment order is what advances the
  state) — `approveWorkspace` (`src/data-access/approvals.ts`) moves the
  workspace straight from `APPROVED` to `AWAITING_CREATOR_RELEASE` in the
  same transaction as the approval itself.
- The creator's explicit "Release Approved Files" action —
  `releaseApprovedFiles` (`src/data-access/delivery-release.ts`), wired to
  the `WorkspaceActions` button on the workspace detail page — creates one
  `DeliveryBundle` + `DeliveryBundleJob` from the immutable approval
  snapshot, with `paymentId: null`. **No `Payment` row and no Razorpay
  order are ever created in this mode.**
- The same worker (`delivery-job-processor.ts`) that processes
  payment-triggered bundles processes this one too — it was already written
  generically against `bundle.paymentId` being nullable.
- `claimDownloadSession` (`src/data-access/downloads.ts`) looks up the
  `DownloadGrant` by `workspaceId`, not by `Payment`, so it works
  identically for both modes.
- Client sees "Approved — waiting for the creator to release files." until
  `FILES_UNLOCKED`/`DELIVERED`; creator sees "Release Approved Files."

## PREVIEW_ONLY

> "Your client can view and comment on protected previews. Original files
> are not released through Project Vault."

```
DRAFT → IN_REVIEW → CHANGES_REQUESTED → IN_REVIEW → CLOSED
```

- `approveWorkspace` throws `ApprovalBlockedError` for this mode — the
  transition table has no `APPROVED` entry reachable from `IN_REVIEW` at
  all, so approval is impossible structurally, not just hidden in the UI.
- No payment, no approval, no download grant, no delivery bundle is ever
  possible in this mode.
- The client can view previews, switch versions, comment, and request
  changes — nothing else.
- The creator closes the project when review is complete —
  `closeWorkspaceForReview` (`src/data-access/workspaces.ts`) moves
  `IN_REVIEW`/`CHANGES_REQUESTED` to the terminal `CLOSED` status.

## Read-only after completion

Both `DELIVERED` (any mode that reaches it) and `CLOSED` (`PREVIEW_ONLY`)
put the master review portal into a read-only state
(`review-portal.tsx`'s `isReadOnly`):

- Approve/pay/request-changes controls disappear.
- New comments and replies are rejected server-side too —
  `addClientReviewComment` throws `ReviewPortalReadOnlyError`
  (`src/data-access/review-comments.ts`) for a `DELIVERED`/`CLOSED`
  workspace, not just hidden client-side.
- Comment/version/pin/annotation history remains fully visible.

## Existing-workspace migration

`deliveryMode` defaults to `PAYMENT_REQUIRED` at the schema level
(`prisma/schema.prisma`), so every workspace created before Phase 7.5
behaves exactly as it did in Phase 7 — no backfill migration was needed.

## Wizard validation (Step 4)

- `PAYMENT_REQUIRED`: amount required, must be > 0, INR only.
- `APPROVAL_ONLY`: amount optional (creator's own reference only — never
  used for checkout).
- `PREVIEW_ONLY`: no amount field at all.

Enforced in `src/validation/workspace.ts`'s `requireAmountForPaymentRequired`
superRefine, not just in the client-side form.

## Test coverage

- Unit: `src/lib/workspace-transitions.test.ts` (full matrix, all three
  modes), `src/validation/workspace.test.ts` (conditional amount rules).
- Integration: `src/data-access/delivery-modes.integration.test.ts` — full
  `APPROVAL_ONLY` approve → release → worker → download round trip with
  zero `Payment` rows created; full `PREVIEW_ONLY` approval-blocked +
  close + read-only-comment-rejection round trip.
