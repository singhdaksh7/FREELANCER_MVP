# MUTATION_ARCHITECTURE.md

Architecture decisions for Phase 4 (real client/workspace mutations via Server Actions). See `AUTH_DATABASE_ARCHITECTURE.md` for the auth/session model this builds on, and `DATABASE_SETUP.md` for hands-on database commands.

## Server Action structure

Every mutation is a `"use server"` function in `src/actions/{clients,workspaces}.ts`, matched 1:1 with a `useActionState`-driven form component. Actions never contain business logic themselves — they:

1. Parse `FormData` into a plain object.
2. Validate it with the matching Zod schema (`src/validation/{client,workspace}.ts`).
3. On validation failure, return `{ fieldErrors, values }` so the form re-renders with the creator's input intact.
4. On success, call the corresponding `src/data-access/{clients,workspaces}.ts` function, which does the actual authorization + Prisma write + activity logging.
5. On a known domain error (`OwnershipError`, `ClientHasWorkspacesError`, `InvalidStatusTransitionError`, `WorkspaceNotDeletableError`), return a safe, specific `{ error }` message. On anything else, `console.error` the real error and return a generic `{ error: "Something went wrong. Please try again." }` — no Prisma/SQL detail ever reaches the client.
6. `revalidatePath()` every affected route, then either `redirect()` (create/update flows, which navigate the creator to a new or the same page) or return `{ success }` (delete/cancel flows, triggered from a confirm dialog that stays on the current page).

| Action | File | Redirects? |
|---|---|---|
| `createClientAction` | `src/actions/clients.ts` | → `/clients?flash=...` |
| `updateClientAction` | `src/actions/clients.ts` | → `/clients?flash=...` |
| `deleteClientAction` | `src/actions/clients.ts` | No — returns `{ error \| success }` |
| `createWorkspaceAction` | `src/actions/workspaces.ts` | → `/workspaces/[id]?flash=...` |
| `updateWorkspaceAction` | `src/actions/workspaces.ts` | → `/workspaces/[id]?flash=...` |
| `cancelWorkspaceAction` | `src/actions/workspaces.ts` | No — returns `{ error \| success }` |
| `deleteWorkspaceAction` | `src/actions/workspaces.ts` | → `/workspaces?flash=...` on success |

### The `?flash=` pattern

A redirect can't carry a toast payload any other way without a session/cookie mechanism, and this phase deliberately avoids adding one just for UI copy. `redirect()` appends `?flash=<message>`; `src/components/ui/flash-toast.tsx` (mounted once per page that can receive one) reads it on mount, shows a success `Toast`, and immediately `router.replace()`s the URL with the param stripped — so refreshing the page never re-shows a stale toast, and the URL a creator might bookmark or share is always clean.

### Progressive enhancement

Every form uses `useActionState` + a real `<form action={formAction}>` — the mutation itself works via a plain POST even before hydration. The multi-step workspace wizard (`WorkspaceWizard`) is the one exception that's inherently JS-dependent (step navigation), matching the original approved design; its *final submission* is still a real form post through the same `useActionState` action as everything else. Every submit button is `disabled={pending}` and swaps its label (e.g. "Save Changes" → "Saving…"), which — combined with `useActionState` only ever having one in-flight action per component — prevents a double submission from a slow network or an impatient double-click.

## Validation strategy

- `src/validation/client.ts` / `src/validation/workspace.ts` — Zod schemas, imported by both the Server Action (authoritative) and, where useful, the client component for cheap immediate feedback (e.g. the wizard's per-step "Continue" gating). The **server-side parse is what's actually enforced** — nothing here trusts client-side validation.
- All text fields are trimmed; client email is lowercased (matching `normalizeEmail()`'s convention elsewhere in the app).
- `amount` is validated as a **decimal-safe string** (`/^\d{1,10}(\.\d{1,2})?$/`, `> 0`, `<= 9999999999.99`) — never `z.number()` — so it never passes through binary floating point before reaching Prisma's `Decimal` column. `src/lib/decimal.ts`'s `toDecimal()` does the actual string → Decimal conversion once validation has already guaranteed the shape.
- `currency` is a Zod enum against `SUPPORTED_CURRENCIES`, currently `["INR"]` only — deliberately not multi-currency yet, because every currency-display helper in this app (`formatINR`) is hardcoded to ₹/en-IN formatting. Adding more currency codes here without also making display multi-currency would let a creator create a workspace the UI then renders incorrectly, so the two are kept in lockstep rather than half-shipping the field.
- `dueDate` is an optional ISO date string, checked with `Date.parse()`.
- Every free-text field has an explicit, generous-but-bounded `maxLength` (title 150, description/notes 2000, watermark text 200, etc.) so nothing can grow an unbounded `TEXT` column from the client.

## Ownership strategy

`src/data-access/authorization.ts` centralizes the three ownership checks the brief calls for, so no individual mutation re-implements a `findFirst({ where: { id, creatorId } })` query itself:

- **`requireOwnedClient(clientId)`** — loads a `Client`, throws `OwnershipError` if it's missing or belongs to a different creator.
- **`requireOwnedWorkspace(workspaceId)`** — same, for `Workspace` (with its `Client` included).
- **`requireClientAvailableToCreator(clientId)`** — an alias of `requireOwnedClient`, used specifically at the moment a workspace is being created/edited to confirm the *submitted* `clientId` is real and owned, before it's ever written as a foreign key.

`OwnershipError` deliberately collapses "doesn't exist" and "belongs to someone else" into the same generic message and the same code path — a mutation or a route (`/workspaces/[id]`, `/clients/[id]/edit`) can never let a caller distinguish the two, which is what would otherwise leak the existence of another creator's records.

`creatorId` is **never** accepted as action/form input anywhere in `src/actions/*` or `src/data-access/*` — every write derives it from `requireAuthenticatedUser()` (Phase 3's session-derived identity), the same pattern the read-only data-access layer already established.

## Transaction strategy

Every mutation that must also write an `ActivityLog` row runs inside `prisma.$transaction(async (tx) => { ... })`, so the record and its audit entry are atomic — a crash between the two is impossible; either both land or neither does (see "Failed mutation does not create an ActivityLog" in Testing below). `src/data-access/activity.ts`'s `recordActivity(tx, input)` always takes the transaction client, never the bare `prisma` singleton, to make it structurally impossible to call it outside a transaction.

Client deletion additionally has a **race-safe backstop**: the "does this client have workspaces" count check happens before the transaction, but `Workspace.clientId` is `onDelete: Restrict`, so even a workspace created in the split second between that check and the delete still can't leave a dangling reference — Postgres rejects the delete (`P2003`), which `deleteOwnedUnusedClient` catches and re-surfaces as the same `ClientHasWorkspacesError` a normal blocked deletion would produce.

## Activity logging

### Schema change (option A — extended `ActivityLog`)

Phase 3's `ActivityLog.workspaceId` was required, which meant client-level mutations (create/edit/delete a client, which aren't tied to any single workspace) had no legal way to be logged without inventing a fake `workspaceId`. Per the brief's explicit option A, this phase made a deliberate migration (`prisma/migrations/20260728065323_phase4_client_workspace_mutations`):

- `ActivityLog.workspaceId` is now **nullable**.
- `ActivityLog.clientId` (nullable, `onDelete: SetNull`) was added — set for client-scoped entries.
- `ActivityLog.creatorId` (nullable, `onDelete: Cascade`) was added — set on **every** row from this phase forward, so a creator-level audit view (not built as a screen in this phase, but now possible) never needs a workspace or client join.
- `Workspace.watermarkText` (nullable `String`) and `Workspace.cancelledAt` (nullable `DateTime`) were added — see "Database migration" below.

Existing (Phase 1–3 seed) `ActivityLog` rows are untouched — they keep their `workspaceId`, have `clientId`/`creatorId` as `NULL`, and their `action` column holds an already-human-readable sentence (e.g. `"Workspace Created"`) rather than one of this phase's action codes.

### Centralized action codes + formatter

`src/lib/activity-log.ts` defines `ActivityAction` (a const object of codes: `WORKSPACE_CREATED`, `WORKSPACE_UPDATED`, `WORKSPACE_CANCELLED`, `WORKSPACE_DELETED`, `CLIENT_CHANGED`, `AMOUNT_CHANGED`, `DUE_DATE_CHANGED`, `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_DELETED`) and `formatActivityLabel(action, metadata)`, a pure function that turns a code + structured `metadata` into one human-readable sentence (e.g. `"Amount changed to ₹30,000"`, `"Client changed to Priya Verma"`). Every Phase 4 mutation writes one of these codes — never a hand-built string — into `ActivityLog.action`. Rows written before this phase don't match any code, so the formatter's `default` branch renders their already-finished sentence unchanged, keeping old and new rows readable side by side without a backfill migration.

`getOwnedWorkspaceDetail()` and `getDashboardData()` both call `formatActivityLabel()` when mapping rows for display — no UI component ever touches `ActivityLog.action` directly or builds its own copy.

### What gets one activity entry, and when

- **Workspace create** → one `WORKSPACE_CREATED` entry, always.
- **Workspace edit** → *up to* four entries, one per kind of change that actually happened: `CLIENT_CHANGED` (client reassigned), `AMOUNT_CHANGED` (amount and/or currency changed), `DUE_DATE_CHANGED`, and a single `WORKSPACE_UPDATED` bundling any changed descriptive fields (title, description, watermark text). Resubmitting a form with no real changes writes **zero** entries.
- **Workspace cancel** → one `WORKSPACE_CANCELLED` entry.
- **Workspace permanent delete** → the workspace's own `ActivityLog` rows are deleted along with it (nothing left to reference the now-gone `workspaceId`); no new entry is written (there is nothing left for it to be attached to).
- **Client create/update/delete** → one `CLIENT_CREATED` / `CLIENT_UPDATED` (only if fields actually changed) / `CLIENT_DELETED` entry, scoped by `clientId` (create/update) or left `clientId`-less (delete — see below) and always `creatorId`-scoped.

### What activity metadata never contains

`metadata` is a `Json` column populated only with the specific, already-safe fields each formatter needs (e.g. `{ fromAmount, toAmount, currency }`, `{ changedFields: string[] }`, `{ name }`). It never contains: passwords, auth tokens, database URLs/connection strings, raw `FormData`/request bodies, or any field not explicitly listed in `src/lib/activity-log.ts`'s `ActivityMetadata` type.

One deliberate exception to "always set `clientId`": the `CLIENT_DELETED` entry is written **without** `clientId` — by the time the activity row is inserted (same transaction, after the delete), the client no longer exists, so setting `clientId` would be a dangling foreign key. The client's name is preserved in `metadata.name` instead so the entry still reads correctly forever.

## Safe deletion rules

- **Client**: deletable only when it has **zero** associated workspaces (`deleteOwnedUnusedClient`, backed by `ClientHasWorkspacesError` + the race-safe `P2003` catch above). Never cascades over workspace/payment history.
- **Workspace (permanent delete)**: deletable only when **all** of the following hold (`deleteOwnedDraftWorkspace`, backed by `WorkspaceNotDeletableError`):
  1. `status === "DRAFT"`.
  2. Zero associated `Payment` rows.
  3. Zero `ActivityLog` rows beyond its own `WORKSPACE_CREATED` entry (i.e., genuinely untouched since creation).

  Anything that's ever been shared, commented on, approved, or paid must be **cancelled**, never deleted — this is the "delete button... only for an untouched DRAFT workspace" rule from the brief, implemented as an actual server-side guard, not just a hidden button.

## Status transition rules

- **Cancel** (`cancelOwnedWorkspace`) is refused (via `InvalidStatusTransitionError`) for a workspace that is already `CANCELLED`, or in any financially-locked status (`PAID`, `FILES_UNLOCKED`, `DELIVERED`) — payment history is never touched or reinterpreted by a cancellation.
- **Financial lock on edit**: `updateOwnedWorkspace` silently keeps `amount`, `currency`, and `clientId` at their existing database values — regardless of what the submitted form contains — whenever the workspace's current status is `PAID`, `FILES_UNLOCKED`, or `DELIVERED` (`FINANCIAL_LOCK_STATUSES`, exported from `src/data-access/workspaces.ts`). Only descriptive fields (title, description, watermark text, due date) apply. This is enforced in the data-access layer, not just hidden/disabled in the UI (`WorkspaceEditForm` also disables those inputs and explains why, but that's a UX nicety — the real guarantee is server-side).

## Error-handling strategy

- Every action distinguishes **expected domain errors** (thrown as named classes: `OwnershipError`, `ClientHasWorkspacesError`, `InvalidStatusTransitionError`, `WorkspaceNotDeletableError`) from **unexpected errors**. Only the former ever becomes a specific user-facing message; everything else becomes the same generic "Something went wrong. Please try again." after being `console.error`'d server-side.
- No Prisma error (constraint violation text, connection string, stack trace) is ever serialized into a Server Action's returned state.
- Field-level Zod errors (`parsed.error.flatten().fieldErrors`) are returned as-is per field — these are safe because they're the schema's own static messages ("Title is required."), never anything derived from the database.
- `notFound()` (not a 403/permission-denied page) is what `/workspaces/[id]`, `/workspaces/[id]/edit`, and `/clients/[id]/edit` render for a nonexistent-or-not-owned record — see "Ownership strategy" above for why that's a deliberate choice, not an oversight.

## Testing

- **Unit** (`vitest run`, mocked Prisma/session): `src/validation/{client,workspace}.test.ts` (schema edge cases), `src/lib/decimal.test.ts` (workspace-amount parsing precision), `src/lib/activity-log.test.ts` (formatter output per action code + legacy fallback), `src/data-access/mutations.test.ts` (paid-workspace edit lock, client-deletion-with-workspaces block, unsupported status transitions, owned-client selection validation — each against a mocked `prisma.$transaction`).
- **Integration** (`npm run test:integration`, real Postgres test database): `src/data-access/mutations.integration.test.ts` covers the creator-creates/edits/deletes-a-client and creator-creates/edits/cancels-a-workspace flows end to end, including the two-creator ownership boundary (Meera can't touch Arjun's records) and that a failed mutation writes zero `ActivityLog` rows while a successful one writes exactly the expected number.
- **E2E** (`npx playwright test --project=mutations-e2e`, real dev server + dev database, no mocking): `e2e/mutations/mutations.spec.ts` — create/validate/edit/block-delete/delete a client, create-through-the-five-step-wizard/refresh/edit/cancel a workspace, an unauthorized workspace id resolving through `not-found` rather than a 403, and the wizard's mobile-viewport usability. Deliberately kept in **one file** (not split by entity) so Playwright always schedules its serial test sequence onto a single worker — splitting it caused real, reproducible flakiness from two files' worth of mutations contending for the one shared dev server process under this environment's load (the same category of accommodation `e2e/auth/auth-flow.spec.ts` already documents for the same reason).
- **Visual** (`npx playwright test --project=desktop-1440 --project=tablet-768 --project=mobile-390`, after `--project=setup`): new baselines for the client create/edit forms, the delete-confirmation dialog, Create Workspace step 1 and the review step, and the workspace details screen's overview/files/activity tabs.

**Run `mutations-e2e` and the visual/auth projects separately, not together** (e.g. not via the combined `npm run test:visual`, which runs every project at once). Both share the one dev-server process and dev database; running the mutation suite's real client/workspace creates and deletes concurrently with the visual suite's pixel-exact dashboard/workspaces screenshots was observed to make those screenshots briefly include the mutation suite's in-flight test records, causing spurious diffs. Each suite is stable and deterministic on its own — this is purely a shared-environment scheduling concern, not a product bug. `npm run test:integration` (a separate database) has no such conflict with anything.

## Phase 5 addendum

File upload/processing mutations (`src/actions/files.ts`, `src/data-access/{uploads,files}.ts`) follow every pattern documented above unchanged — ownership via `requireOwnedWorkspaceFile` (an extension of the same `src/data-access/authorization.ts` module), Zod-validated inputs, transactional activity logging (`FILE_UPLOAD_STARTED`/`FILE_UPLOADED`/`FILE_PROCESSING_COMPLETED`/`FILE_PROCESSING_FAILED`/`FILE_PROCESSING_RETRIED`/`FILE_DELETED`, added to `src/lib/activity-log.ts`'s centralized formatter), and safe generic errors. Two differences worth calling out:

- **Upload-session creation/completion and preview-URL issuance are route handlers, not Server Actions** — the Phase 5 brief calls for this explicitly, since they're genuine HTTP request/response workflows (a presigned URL response, a browser's direct storage PUT) rather than form-submission-shaped mutations. `src/lib/api-errors.ts` was added specifically so these route handlers could reuse the exact same session-derived-auth data-access functions (`requireAuthenticatedUser()` etc., which call Next's `redirect()` on a missing session) without that redirect leaking into what should be a JSON 401 response — see that file's doc comment.
- **File processing itself is not a Server Action, a route handler, or a mutation triggered by a request at all** — it happens in `src/worker/process-files.ts`, a separate long-lived process outside the Next.js request/response cycle entirely. See `FILE_STORAGE_ARCHITECTURE.md` and `FILE_PROCESSING_RUNBOOK.md` for the full architecture and operational detail.
