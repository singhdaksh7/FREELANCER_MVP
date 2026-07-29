# PAYMENT_ARCHITECTURE.md

Architecture decisions for Phase 7 (Razorpay payments, verified payment state, secure file unlocking and original downloads). See `CLIENT_REVIEW_ARCHITECTURE.md` for the approval workflow this phase builds on, `WEBHOOK_SECURITY.md` for the webhook endpoint specifically, and `SECURE_DOWNLOAD_ARCHITECTURE.md` for delivery/download.

## Gateway abstraction

`src/payments/` — business logic never imports Razorpay directly:

- `payment-gateway.ts` — the `PaymentGateway` interface (`createOrder`, `fetchOrder`, `fetchPayment`, `verifyCheckoutSignature`, `verifyWebhookSignature`).
- `razorpay-gateway.ts` — production implementation. Plain REST calls against `https://api.razorpay.com/v1` with HTTP Basic Auth (key id : key secret), not the official SDK — keeps the dependency surface smaller; the abstraction is what matters, not the transport.
- `fake-payment-gateway.ts` — deterministic, entirely in-memory test double. Computes **real** HMAC-SHA256 signatures (with fixed test secrets), so signature-verification code is genuinely exercised by tests — only the "is this order/payment real" state is faked. Exports test-only helpers: `fakeGatewaySimulateCheckout`, `fakeGatewaySetPaymentStatus`, `fakeGatewayBuildWebhookEvent`.
- `payment-config.ts` — reads/validates `PAYMENT_PROVIDER`/`RAZORPAY_*` env vars, and is the single production guard: refuses to boot with the fake provider, test-mode keys, a key id that doesn't look live, a public/server key id mismatch, or a secret that still looks like a development placeholder, whenever `NODE_ENV=production`.
- `payment-signatures.ts` — the actual HMAC-SHA256 checkout/webhook signature computation and constant-time verification, shared by both gateway implementations.
- `payment-amount.ts` — Decimal-to-paise conversion (see "Amount handling").
- `payment-errors.ts` — shared gateway-level error classes (`PaymentConfigError`, `PaymentGatewayError`, `InvalidSignatureError`, `AmountMismatchError`, `CurrencyMismatchError`, `UnknownOrderError`).
- `src/payments/index.ts`'s `getPaymentGateway()` is the single provider-selection point every other module calls — never `razorpay-gateway.ts`/`fake-payment-gateway.ts` directly.

## Amount handling

`src/payments/payment-amount.ts`'s `decimalAmountToSubunits`/`subunitsToDecimalString` convert between a Decimal-shaped string and integer paise **without ever multiplying a float** — the string is split at the decimal point and reassembled with `BigInt` arithmetic. Rejects: more precision than the currency supports (`UnsupportedAmountPrecisionError`), zero/negative amounts, amounts beyond Razorpay's documented ₹1,50,00,000 Standard Checkout ceiling (`AmountOutOfBoundsError`), and any currency other than INR (`UnsupportedCurrencyError` — MVP scope, see "Currency scope" below). `Payment.amountSubunits` is frozen at order-creation time and never re-derived from `Payment.amount` later.

### Currency scope

INR only, matching the existing approved schema (`Workspace.currency` has never had a second, fully-tested value anywhere in this app — see `MUTATION_ARCHITECTURE.md` "Validation strategy"). `assertSupportedCurrency` throws rather than silently converting.

## Order lifecycle

`src/data-access/payment-orders.ts`'s `createPaymentOrder(context: ReviewContext)`:

1. Loads the workspace fresh from the database; requires `status === "APPROVED"` (or an already-`PAYMENT_PENDING` workspace, to safely reuse an existing order — see "Idempotency").
2. Loads the latest `APPROVED` `WorkspaceApproval` for the workspace.
3. Re-validates the approval's immutable file-version snapshot still resolves to real, non-deleted `WorkspaceFile`/`FileVersion` rows (`ApprovalSnapshotInvalidError` otherwise) — a subsequent file deletion can never silently let a stale snapshot through to payment.
4. Computes `amountSubunits` from `workspace.amount`/`workspace.currency` — **never** from anything the browser sends.
5. Resolves-or-creates a local `Payment` row transactionally (see "Idempotency"), then creates the Razorpay order **outside** that transaction (an external HTTP call has no place inside a Prisma transaction), then persists `gatewayOrderId` + transitions `APPROVED -> PAYMENT_PENDING` + records `PAYMENT_ORDER_CREATED` activity in one final transaction.
6. Returns only safe checkout configuration (`keyId` — the public key id, `orderId`, `amountSubunits`, `amount`, `currency`, workspace/creator/client display names) — never the key secret, webhook secret, or any storage key.

A repeat request while an order is already active (`CREATED`/`PENDING`) returns the **same** order rather than creating a second one.

## Checkout callback

The browser never trusts its own Checkout callback. `PaymentPanel` (`src/components/review/payment-panel.tsx`) posts the callback's `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature` to `POST /api/review/[token]/payments/verify`, then immediately shows **"Payment received. Confirming settlement…"** — never a success message derived from the callback alone.

## Signature verification

`src/data-access/payment-verification.ts`'s `verifyCheckoutCallback`:

1. Looks up the local `Payment` by `(workspaceId, gatewayOrderId)` — scoped to the token's own workspace, so a client can never verify a signature against another workspace's payment.
2. Verifies the signature using the **server-stored** `gatewayOrderId` (the lookup itself already required an exact match).
3. On success: records `gatewayPaymentId`, sets `gatewaySignatureVerifiedAt`, and moves `Payment.status` from `CREATED` to `PENDING` — **never** to `PAID`. Capture must still be independently confirmed via webhook or reconciliation.
4. On failure: throws `InvalidSignatureError` (a safe, generic message — never cryptographic detail), records a `PAYMENT_CHECKOUT_VERIFICATION_FAILED` activity entry, and touches nothing else — the workspace/payment state is completely unchanged.

## Captured-payment definition

`Payment.status = "PAID"` means, simultaneously:

- Signature or webhook authenticity has been established.
- The gateway's own payment-entity status is `"captured"` (never `"authorized"`).
- The gateway order id, amount (subunits), and currency all matched what this app's own `Payment` row expected.

`PAID` is **only** ever set by `finalizeCapturedPayment` (below) — never by the checkout-verification endpoint, never by a frontend callback, never manually by a creator.

## Central payment-finalization service

`src/data-access/payment-finalization.ts`'s `finalizeCapturedPayment(input)` is the **one** idempotent service both the webhook route and the reconciliation path call — neither implements any separate state-changing logic:

1. Loads the local `Payment` by `gatewayOrderId`. Unknown order → `UnknownOrderError`.
2. If already `PAID`: returns `{ alreadyFinalized: true }` immediately — no further writes (see "Idempotency").
3. Verifies `amountSubunits`/`currency` match exactly (`AmountMismatchError`/`CurrencyMismatchError` otherwise — finalization is blocked, nothing changes).
4. Verifies the workspace is `PAYMENT_PENDING` (or already past it, for a same-payment race — see "Idempotency") — `WorkspaceNotPayableError` otherwise.
5. In one transaction: sets `Payment.status = "PAID"` (+ `capturedAt`/`paidAt`), transitions the workspace `PAYMENT_PENDING -> PAID` through the centralized transition policy, records `PAYMENT_CAPTURED` activity, and creates **exactly one** `DeliveryBundle` + one `DeliveryBundleJob` (both scoped `@unique` on `paymentId`, so a genuine concurrent race loses on a database constraint, not a race condition in application code — the loser's transaction rolls back and the function reports `alreadyFinalized: true`).
6. Records `DELIVERY_PREPARATION_STARTED` activity.

`recordPaymentFailure(gatewayOrderId, code, reason)` is the sibling, non-state-escalating function for `payment.failed` — marks the specific `Payment` row `FAILED` (never downgrades an already-`PAID` row) and records `PAYMENT_FAILED` activity. The workspace itself stays `PAYMENT_PENDING` so the client can start a new order/attempt without contacting the creator.

## Idempotency

- **Order creation**: an active (`CREATED`/`PENDING`) `Payment` for the same `(workspaceId, approvalId)` is reused. A concurrent duplicate-attempt race is resolved via `Payment.idempotencyKey`'s unique constraint (`${workspaceId}:${approvalId}:attempt-${n}`) — the loser catches the `P2002` conflict and re-fetches the winner's row instead of erroring.
- **Finalization**: repeated calls with the same `gatewayOrderId`/`gatewayPaymentId` (webhook retry, or a webhook arriving after reconciliation already finalized the same payment) return `{ alreadyFinalized: true }` without any further write — see step 2/6 above.
- **Webhooks**: see `WEBHOOK_SECURITY.md` "Event-ID deduplication."

## Reconciliation

`src/data-access/payment-reconciliation.ts`'s `reconcilePaymentStatus(paymentId)`:

- Rate-limited to one attempt per `PAYMENT_RECONCILIATION_COOLDOWN` seconds **per payment id** (`checkRateLimit`, bucket `"payment-reconciliation"`).
- Short-circuits immediately for an already-`PAID`/`FAILED` payment, or one that hasn't completed Checkout verification yet (no `gatewayPaymentId`).
- Otherwise fetches the live payment from the gateway (`gateway.fetchPayment`) — **never** trusts a browser-supplied amount/status — and, on `"captured"`, calls `finalizeCapturedPayment` (the same service the webhook uses); on `"failed"`, calls `recordPaymentFailure`.
- Reachable two ways: `POST /api/review/[token]/payments/reconcile` (client, token-authorized — `PaymentPanel` calls this once, ~6 seconds after a verified checkout callback, as a webhook-delay fallback) and `refreshPaymentStatusAction` (creator, session-authorized Server Action on the workspace Payment tab).
- The client **polls** `GET /api/review/[token]/payments/status` (database-only, no gateway call) for live UI state — never Razorpay directly, and never `localStorage` as financial truth. A browser refresh re-derives phase entirely from this endpoint.

## Payment state machine

Extends `src/lib/workspace-transitions.ts`'s centralized allow-list:

| From | To | Gate |
|---|---|---|
| `APPROVED` | `PAYMENT_PENDING` | Local Payment + Razorpay order both created |
| `PAYMENT_PENDING` | `PAID` | `finalizeCapturedPayment` only |
| `PAID` | `FILES_UNLOCKED` | Delivery-bundle worker success (see `SECURE_DOWNLOAD_ARCHITECTURE.md`) |
| `FILES_UNLOCKED` | `DELIVERED` | First successful secure download |

`PAID`/`FILES_UNLOCKED`/`DELIVERED` are financially locked — no `CANCELLED` transition exists from any of them (matches the pre-existing `FINANCIAL_LOCK_STATUSES` rule). A failed payment leaves the workspace at `PAYMENT_PENDING` (never rolled back further) so the client can retry with a fresh order.

## Failure behavior

See `SECURE_DOWNLOAD_ARCHITECTURE.md` for delivery-specific failure handling. General principles, enforced throughout this phase's code:

- A captured payment is **never** asked to pay again, regardless of what fails downstream.
- `PAID` is never rolled back to `PAYMENT_PENDING`.
- A checkout-verification failure, webhook signature failure, amount/currency mismatch, or unknown order **never** touches workspace/payment state beyond a safe activity-log entry.
- Duplicate/out-of-order webhook deliveries never re-run `finalizeCapturedPayment`'s side effects (idempotent by construction, not by ordering assumption).

## Error redaction

Every route handler maps errors through `src/lib/api-errors.ts`'s `apiErrorResponse` — only explicitly-listed, known-safe error classes' `.message` (all hand-authored, generic strings — see each error class above) are ever serialized to the client. Anything else is `console.error`'d server-side and reduced to one generic message. No Razorpay response body, Prisma error, or stack trace is ever returned to a browser.
