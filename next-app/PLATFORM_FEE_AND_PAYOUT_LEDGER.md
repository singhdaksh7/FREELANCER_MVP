# Platform Fee & Payout Ledger (Phase 7.5)

## 2% platform-fee policy

- The client pays exactly the approved project amount — the platform fee is
  never added on top.
- The platform fee is deducted from the freelancer's side: freelancer
  payable = project amount − platform fee.
- Default rate: **200 basis points (2.00%)**, `DEFAULT_PLATFORM_FEE_BPS` in
  `src/payments/platform-fee.ts`, overridable via `PLATFORM_FEE_BPS`
  (integer basis points).

Example (₹10,000 project):

| Field | Amount |
|---|---|
| Project amount | ₹10,000.00 |
| Client charged | ₹10,000.00 |
| Platform fee (2%) | ₹200.00 |
| Freelancer payable | ₹9,800.00 |

## Integer-subunit math

`calculatePaymentBreakdown` (`src/payments/platform-fee.ts`) works entirely
in `bigint` paise (subunits) — never floating point. The fee is computed as
`projectAmountSubunits * bps / 10000` using integer (floor) division, so:

- `platformFeeSubunits + freelancerPayableSubunits` always equals
  `projectAmountSubunits` exactly, for every input — no rounding remainder
  is ever silently lost or double-counted.
- A one-paisa-or-smaller remainder from the floor division always stays
  with the freelancer, consistently.

See `src/payments/platform-fee.test.ts` for the rounding-property tests.

## Freezing and immutability

`PaymentBreakdown` (one row per `Payment`, `prisma/schema.prisma`) is
computed once and written **inside the same transaction that persists the
Razorpay order id**, in `createPaymentOrder`
(`src/data-access/payment-orders.ts`) — not at capture time, and never
recomputed afterward. A later change to `PLATFORM_FEE_BPS` only affects
orders created after the change; every already-frozen `PaymentBreakdown`
row is untouched (`src/payments/platform-fee.test.ts`'s "historical fee
immutability" test).

`gatewayFeeSubunits`/`gatewayFeeTaxSubunits` exist on the model but are
never populated in this phase — **the policy for who bears the payment
gateway's own processing fee has not been decided by stakeholders yet.**
Do not deduct it silently if/when that decision is made; it needs an
explicit, documented policy change first.

## Freelancer payable ledger

Two models, `CreatorBalanceAccount` (one row per creator, a derived
running summary) and `PayoutLedgerEntry` (append-only,
`PayoutLedgerType`: `PAYMENT_CREDIT` / `PLATFORM_FEE` / `PAYOUT` /
`ADJUSTMENT` / `REVERSAL`).

When `finalizeCapturedPayment` (`src/data-access/payment-finalization.ts`)
marks a payment `PAID`, in the same transaction it also (guarded by an
existing-`PAYMENT_CREDIT`-for-this-payment check, so a webhook retry can
never double-credit):

1. Creates a `PAYMENT_CREDIT` entry for `freelancerPayableSubunits`,
   status `PENDING`, `availableAt = capturedAt + PAYOUT_HOLD_HOURS`.
2. Creates a `PLATFORM_FEE` entry for `platformFeeSubunits`, status `PAID`
   (collected as part of the same capture — no payout lifecycle of its
   own).
3. Upserts `CreatorBalanceAccount.pendingSubunits += freelancerPayableSubunits`.
4. Writes a `FREELANCER_PAYABLE_CREATED` activity entry.

`PAYOUT_HOLD_HOURS` (`src/payouts/payout-config.ts`, default 48, never
hardcoded at call sites) is how long a fresh credit stays `PENDING` before
it's eligible to move to `AVAILABLE`.

## Test-mode payout simulation

`src/payouts/`:

- `payout-provider.ts` — the `PayoutProvider` interface
  (`markAvailable`/`startPayout`/`completePayout`/`failPayout`, each
  operating on one `PayoutLedgerEntry`) and `getPayoutProvider()`, the
  single selection point. **Refuses to run in production unconditionally**
  (`assertProductionSafe`) — there is no live provider implemented yet, so
  any provider selection is unsafe in `NODE_ENV=production`, not just
  `PAYOUT_PROVIDER="fake"` specifically.
- `fake-payout-provider.ts` — the only implementation. Every method is
  idempotent (repeating a completed step is a no-op) and moves an entry
  forward only: `PENDING → AVAILABLE → PROCESSING → PAID`, or
  `PROCESSING → FAILED` (retryable back into `PROCESSING`). Never touches
  `Payment` or `DownloadGrant` — client download access and payment truth
  are completely unaffected by any payout simulation state.
- No real bank account is ever contacted. No KYC document, PAN, Aadhaar, or
  bank-account number is collected anywhere in this phase (see "Settings"
  below).

Admin-only (`requireAdminRole`, re-verified inside
`src/data-access/admin.ts`'s `adminSimulatePayoutStep`, not trusted from the
action layer alone) simulation controls live at `/admin/payouts`. Every
simulated step also writes its own `PAYOUT_*` activity entry recording
which admin triggered it (`simulatedBy` in the entry's metadata).

## Creator-facing balance view

`/payments` (`src/data-access/payouts.ts`'s `getCreatorBalanceSummary` +
`CreatorBalanceCard`) shows pending/available/paid-out balances and a
"Test-mode payout simulation — no real funds are transferred" label. The
workspace Payment tab (`PaymentStatusCard`) shows gross amount, the 2% fee,
and the expected payout for that specific payment.

## KYC / bank-account placeholders

`/settings` shows only informational states — "Test mode active" /
"Verification required for live payouts" / "Live payouts unavailable" —
never a form. No bank-account number, IFSC, cancelled cheque, PAN, Aadhaar,
or other identity document is collected or stored anywhere in the
application in this phase.

## Test coverage

- Unit: `src/payments/platform-fee.test.ts` (calculation, rounding,
  immutability), `src/payouts/fake-payout-provider.test.ts` (all
  transitions + idempotency), `src/payouts/payout-provider.test.ts`
  (production guard).
- Integration: the platform-fee/ledger/payout-simulation assertions
  appended to `payment-workflow.integration.test.ts`'s full happy-path
  test — real breakdown freezing, real ledger credit, real
  `markAvailable → startPayout → completePayout` simulation via the real
  `fakePayoutProvider`, with idempotency and payment-state-unaffected
  checks.
