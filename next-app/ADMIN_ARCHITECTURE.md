# Admin Architecture (Phase 7.5)

Minimal, database-backed, role-protected admin portal — `src/app/admin/`,
`src/data-access/admin.ts`.

## Role gate (two layers, neither optional)

1. `src/proxy.ts` — `/admin` is in `PROTECTED_PREFIXES`, so an
   unauthenticated request is redirected to `/login` before any Server
   Component runs. This is the fast-path only; it checks session presence,
   not role.
2. `src/app/admin/layout.tsx` — calls `requireAdminRole()`
   (`src/data-access/auth.ts`), which redirects a non-admin (including an
   authenticated `CREATOR`) to `/permission-denied`. **Every** admin
   data-access function (`getAdminDashboardStats`, `getAdminPayoutLedger`,
   `adminSimulatePayoutStep`, `getAdminSupportTickets`,
   `addAdminSupportMessage`, `updateSupportTicketStatus`) calls
   `requireAdminRole()` again itself — the layout is never the only thing
   standing between an authenticated creator and admin data.

Verified in a real browser session in this phase: an authenticated
`CREATOR` visiting `/admin` lands on `/permission-denied`; the seeded
`ADMIN` account (`admin@example.com`, `prisma/seed.ts`) reaches the
dashboard normally.

## Routes (implemented this phase)

| Route | Purpose |
|---|---|
| `/admin` | Dashboard — total creators, active workspaces, payments captured, platform fees, pending freelancer payable, open support tickets, file-processing failures. All direct database aggregates (`getAdminDashboardStats`), nothing manually editable. |
| `/admin/support` | Paginated ticket list. |
| `/admin/support/[ticketId]` | Ticket detail — reply, change status. |
| `/admin/payouts` | Paginated payout-ledger view + test-mode payout simulation controls (`PayoutSimulationControls`). |

`/admin/users`, `/admin/workspaces`, and `/admin/payments` (listed as
*suggested* routes in the requirements) were **not** built this phase —
see "Deferred" below. The dashboard already surfaces the workspace/payment
aggregate figures the requirements call for; per-row browsing of those
tables is the deferred part.

## What an admin can write — and the boundary around it

The **entire set** of admin-triggered mutations in this application:

1. `adminSimulatePayoutStep` — one `PayoutLedgerEntry` state-transition
   step, via the same production-guarded `PayoutProvider` abstraction any
   future automatic trigger would use (see
   PLATFORM_FEE_AND_PAYOUT_LEDGER.md). Writes its own audit activity
   entry recording which admin triggered it.
2. `addAdminSupportMessage` / `updateSupportTicketStatus` — see
   SUPPORT_AND_DISPUTE_ARCHITECTURE.md.

Nothing else. In particular, there is **no function anywhere in the
codebase** that lets an admin:

- Manually mark a payment captured, or fabricate a Razorpay payment.
- Manually create a payment.
- Edit a raw webhook payload.
- Read a raw storage key or a raw token (download/review tokens are
  hash-at-rest everywhere — see REVIEW_TOKEN_SECURITY.md /
  SECURE_DOWNLOAD_ARCHITECTURE.md; admin views never select the hash
  columns).
- Read a password (only `passwordHash` exists on `User`; no admin query
  selects it).
- Impersonate a creator (no "log in as" mechanism exists).
- Delete payment/activity history.
- Unlock files without a valid `Payment` (`PAYMENT_REQUIRED`) or a valid
  creator release (`APPROVAL_ONLY`) — `finalizeCapturedPayment` and
  `releaseApprovedFiles` are the only two functions that ever create a
  `DeliveryBundle`, and neither has an admin-triggered call site.

This is enforced by the *absence* of such functions, not by a permission
check inside them that could be misconfigured later.

## Pagination and filters

`getAdminPayoutLedger(page, pageSize)` and `getAdminSupportTickets(page,
pageSize)` both take/return a bounded page (`skip`/`take`, default page
size 25) plus a total count — no unbounded list query anywhere in the
admin portal.

## Deferred

- `/admin/users`, `/admin/workspaces`, `/admin/payments` (per-row browsing
  — the dashboard aggregates already cover the required summary figures).
- Admin action audit *list view* (the activity entries are written and
  queryable via `ActivityLog`, but there's no dedicated admin screen to
  browse them yet — the same data any creator's activity feed already
  reads from).
- Any bulk/destructive admin action of any kind.
