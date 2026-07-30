# WEBHOOK_SECURITY.md

Security design for the Phase 7 public Razorpay webhook endpoint (`POST /api/webhooks/razorpay`). See `PAYMENT_ARCHITECTURE.md` for the payment state machine this feeds into.

## No creator/review-token authentication

This endpoint has **no session, no cookie, no review token, no download token** — it's a public URL Razorpay's infrastructure calls directly. Authenticity comes entirely from the signature (below), never from who/what is calling.

## Raw-body verification

`src/app/api/webhooks/razorpay/route.ts` reads the request body with `request.text()` — the **raw, untouched bytes** Razorpay signed — before anything else happens. `src/data-access/webhook-processing.ts`'s `processRazorpayWebhookDelivery` verifies the signature against that exact raw string; the JSON body is only ever `JSON.parse`'d **after** signature verification succeeds. A re-serialized (even semantically identical) JSON string will not match the signature — see `payment-signatures.test.ts`'s "rejects when the body is re-serialized differently" case.

## Signature validation

`src/payments/payment-signatures.ts`'s `verifyWebhookSignature` computes `HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)` and compares it to the `X-Razorpay-Signature` header using `node:crypto`'s `timingSafeEqual` (constant-time — never a `===` string compare on a secret-derived value). A missing signature header, missing `x-razorpay-event-id` header, or a signature that doesn't verify all short-circuit to `"invalid_signature"` before any `WebhookEvent` row references the (unparsed) payload beyond a note.

## Event-ID deduplication

Every delivery is recorded as one `WebhookEvent` row, keyed `@unique` on `externalEventId` (Razorpay's `x-razorpay-event-id`):

- A **new** event id creates a `PROCESSING` row, then routes to `handleEvent()`, then updates the row to `PROCESSED`/`IGNORED`/`FAILED`.
- A **duplicate** event id that already reached `PROCESSED` returns `"duplicate"` immediately — `handleEvent()` (and therefore `finalizeCapturedPayment`) is never called again.
- A duplicate event id whose prior delivery **failed** (or was left mid-processing, e.g. by a process crash) is retried — safe because `finalizeCapturedPayment` is itself fully idempotent against an already-`PAID` payment (see `PAYMENT_ARCHITECTURE.md` "Idempotency"), so a retry can never double-apply an effect even if the first attempt partially succeeded before failing.
- A genuine concurrent double-delivery of the *same* event id races on `WebhookEvent.externalEventId`'s unique constraint at creation time — the loser reads back the winner's row rather than erroring.

## Out-of-order handling

Nothing in this endpoint assumes delivery order. `payment.failed` for one payment and `payment.captured` for a different payment can arrive in either order and are processed independently. For the **same** payment, `finalizeCapturedPayment`'s own state checks (already-`PAID` short-circuit, `WorkspaceNotPayableError` for an unexpected workspace status) make a late/re-ordered event a safe no-op rather than a corruption.

## Handled events

| Event | Effect |
|---|---|
| `payment.captured` | `finalizeCapturedPayment` (only if `entity.status === "captured"`) |
| `order.paid` | Same as `payment.captured` — an optional reconciliation event, routed through the identical idempotent path, so it can never produce duplicate unlocking |
| `payment.failed` | `recordPaymentFailure` |
| `payment.authorized` | Ignored — authorization is not capture |
| anything else | Ignored |

## Never unlocks for

`payment.authorized`, a checkout callback alone, a malformed body, an amount/currency mismatch, an unknown gateway order, an unknown payment, a failed signature, or an already-`PROCESSED` duplicate event — every one of these either short-circuits before `handleEvent()` runs, or `handleEvent()`/`finalizeCapturedPayment` itself rejects it without touching state (see `PAYMENT_ARCHITECTURE.md`'s error classes).

## Retry behavior

- `"processed"` / `"duplicate"` / `"ignored"` → `200` (tells Razorpay's retry infrastructure the delivery was received and handled — including "handled by intentionally ignoring it").
- `"invalid_signature"` / `"malformed"` → `400`.
- `"error"` (an unexpected exception during `handleEvent`, or a rejected domain error like `AmountMismatchError`) → `500`, encouraging Razorpay to retry later. Safe to retry: `finalizeCapturedPayment` is idempotent, and a business-rule rejection (amount/currency mismatch) will simply be rejected identically on retry rather than causing a duplicate effect.

## Error redaction

`console.error` logs the real error object server-side; the HTTP response to Razorpay is always one of the fixed JSON bodies above (`{ ok: true }` or `{ error: "..." }`) — never a raw exception message, stack trace, or Prisma error. `WebhookEvent.processingError` stores a safe message (either one of this app's own error classes' `.message`, or a generic fallback) — never the webhook secret, never a raw SDK/driver error string beyond what's already been reduced to a safe message.

## Secret rotation considerations

`RAZORPAY_WEBHOOK_SECRET` is read once per process via `payment-config.ts`'s cached `getPaymentConfig()`. Rotating it requires a process restart (or, in a multi-instance deployment, a rolling restart) — there is no in-process hot-reload of this secret in this phase. During a rotation window, configure Razorpay's dashboard with the new secret only after the deployment serving this endpoint has restarted with it; a webhook signed with a secret this process doesn't yet know about is rejected as `"invalid_signature"` (safe — it's recorded and can be manually reconciled via `reconcilePaymentStatus` afterward, since reconciliation doesn't depend on the webhook secret at all).

## Logging discipline

Never logged, anywhere in this codebase: `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_KEY_SECRET`, a raw `X-Razorpay-Signature` value, or a raw download/review token. `WebhookEvent.payload` stores the parsed body for audit/replay — safe, since Razorpay's payment-entity payloads don't include credentials — but is never rendered in any creator-facing UI in this phase (see `PAYMENT_ARCHITECTURE.md`'s "do not display... full webhook payload" instruction).
