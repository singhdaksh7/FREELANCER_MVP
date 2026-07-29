# RAZORPAY_TEST_MODE_CHECKLIST.md

Manual staging checklist for exercising a real Razorpay Test Mode integration (not the automated `fake` provider used by `npm run test`/`npm run test:integration` — see `PAYMENT_ARCHITECTURE.md` "Gateway abstraction"). **Never commit real keys** — this file contains no credentials, only steps.

## 1. Test credentials setup

1. Create/open a Razorpay account, switch the dashboard to **Test Mode**.
2. Settings → API Keys → generate a test key pair (`rzp_test_...` key id + secret).
3. In your staging `.env` (never committed):
   ```
   PAYMENT_PROVIDER="razorpay"
   RAZORPAY_MODE="test"
   RAZORPAY_KEY_ID="rzp_test_..."
   RAZORPAY_KEY_SECRET="..."
   NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_..."   # must equal RAZORPAY_KEY_ID
   RAZORPAY_WEBHOOK_SECRET="..."                 # set after step 5 below
   ```
4. Confirm `NODE_ENV` is **not** `production` on this staging box, or confirm `RAZORPAY_MODE="test"` with a genuinely `rzp_test_...` key id (production mode requires live keys — see `payment-config.ts`'s guard).

## 2. Order creation

- [ ] Open an `APPROVED` workspace's review link, confirm the amount shown matches the database (`Workspace.amount`), not a hardcoded figure.
- [ ] Click "Pay and Unlock Files" — confirm `POST /api/review/[token]/payments/orders` returns `201` with a real `order_...` id (visible in Razorpay's dashboard → Orders).
- [ ] Refresh the page before completing Checkout — confirm the same order is reused (no duplicate order created; check the dashboard).

## 3. Successful test payment

- [ ] Complete Checkout using a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-upi-details/) (e.g. `4111 1111 1111 1111`, any future expiry, any CVV).
- [ ] Confirm the UI shows **"Payment received. Confirming settlement…"** — never an immediate "Payment successful."
- [ ] Confirm `POST /api/review/[token]/payments/verify` returned `200` (check network tab) and `Payment.gatewaySignatureVerifiedAt` is set (Prisma Studio or a DB query).

## 4. Failed test payment

- [ ] Start a new order, use a [Razorpay test failure card](https://razorpay.com/docs/payments/payments/test-card-upi-details/) or force a failure in the test Checkout UI.
- [ ] Confirm the UI shows a "Payment failed — no charge was made" state with a **Try Again** action.
- [ ] Confirm the workspace stays `PAYMENT_PENDING` (not rolled back further) and the specific `Payment` row is `FAILED`.

## 5. Webhook setup

1. Razorpay dashboard → Settings → Webhooks → add a webhook pointing at `https://<your-staging-domain>/api/webhooks/razorpay`.
2. Select events: `payment.captured`, `payment.failed` (optionally `order.paid`).
3. Set a webhook secret, copy it into `RAZORPAY_WEBHOOK_SECRET` in your staging `.env`, redeploy.
4. For local staging without a public URL, use a tunnel (ngrok or similar) and point the webhook at the tunnel URL.

## 6. Webhook signature validation

- [ ] Trigger a real captured payment (step 3). Confirm a `WebhookEvent` row appears with `signatureVerified: true`, `processingStatus: "PROCESSED"`.
- [ ] Manually send a webhook request with a deliberately wrong `X-Razorpay-Signature` (e.g. via `curl`) — confirm `400` and a `WebhookEvent` row with `signatureVerified: false`, `processingStatus: "FAILED"`, and that no `Payment`/`Workspace` state changed.

## 7. Duplicate webhook test

- [ ] From the Razorpay dashboard, manually re-trigger the same webhook delivery (Webhooks → Logs → Resend), or replay the same request body/headers via `curl`.
- [ ] Confirm the response is `200`, no second `DeliveryBundle`/`DownloadGrant` was created, and `Payment.capturedAt` didn't change.

## 8. Delayed webhook / reconciliation test

- [ ] Temporarily disable or misconfigure the webhook endpoint (e.g. point it at a 404 URL in the dashboard).
- [ ] Complete a test payment. Confirm the client-side "Confirming settlement…" screen eventually calls `POST /api/review/[token]/payments/reconcile` (network tab, ~6 seconds after checkout) and the payment finalizes via reconciliation instead.
- [ ] Re-enable the webhook, confirm a late-arriving webhook for the same payment is a safe no-op (no duplicate bundle/grant).

## 9. Captured-status verification

- [ ] Confirm `Payment.status` only ever reaches `"PAID"` after a real `payment.captured` webhook or a `reconcilePaymentStatus` call that observed `gatewayPayment.status === "captured"` — never from the Checkout callback alone (re-check step 3's network trace: the `/verify` response should never itself claim `"PAID"`).

## 10. Original unlock verification

- [ ] After a successful payment, confirm `npm run worker:deliveries:once` (or the long-running `worker:deliveries` process) picks up the `DeliveryBundleJob`, and the workspace moves to `FILES_UNLOCKED`.
- [ ] Confirm the review portal surfaces a working `/download/[token]` link exactly once.
- [ ] Download an individual file and the full bundle; confirm both succeed, the download counter increments, and the workspace moves to `DELIVERED` after the first download.
- [ ] Confirm `originalStorageKey`/any raw S3 key never appears in any network response (inspect the download redirect — it should be a signed URL, not a plain key).

## Production go-live checklist (placeholders — complete before real launch)

- [ ] Switch `RAZORPAY_MODE="live"`, use live key id/secret (`rzp_live_...`), confirm `payment-config.ts`'s production guard passes (it will refuse to boot otherwise).
- [ ] Point the Razorpay webhook at the production domain with a **separate**, production-only webhook secret.
- [ ] Confirm `PAYMENT_PROVIDER` is never `"fake"` in the production environment (guard already enforces this).
- [ ] Set production-appropriate `DOWNLOAD_GRANT_TTL`/`DOWNLOAD_GRANT_MAX_DOWNLOADS`/`DELIVERY_WORKER_MAX_ATTEMPTS`.
- [ ] Confirm the delivery worker (`worker:deliveries`) runs as a supervised, long-lived process in production (not started ad hoc) — see the equivalent guidance for `worker:files` in `FILE_PROCESSING_RUNBOOK.md`.
- [ ] Rate limits (`src/lib/rate-limit.ts`) are database-backed and therefore already multi-instance-safe — no additional configuration needed for a horizontally-scaled deployment.
- [ ] Confirm refunds, tax invoices, and email delivery remain explicitly out of scope until a dedicated future phase implements and tests them (see `MIGRATION_STATUS.md`'s Phase 7 "Deferred" section).
