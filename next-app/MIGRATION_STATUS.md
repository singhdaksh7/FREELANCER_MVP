# MIGRATION_STATUS.md

## Phase 1 objective

Prove that the approved, visually-frozen Project Vault design can be migrated to Next.js App Router + TypeScript strict mode + Tailwind CSS without visual regression, by rebuilding the design system as centralized tokens and migrating only the lowest-risk, data-free screens — while the original Vite app keeps running untouched for side-by-side comparison. No backend, auth, database, payments, or file handling in scope.

## Completed work

- Scaffolded `next-app/` with Next.js App Router, TypeScript strict mode, Tailwind CSS v4, ESLint, `src/` directory, `@/*` import alias.
- Ported the full design-token set (Vault Navy/Blue, backgrounds, borders, text colors, status colors, radii, shadows) from `src/index.css` into a single centralized token file (`next-app/src/app/globals.css` via Tailwind's `@theme`).
- Loaded the Inter typeface correctly via `next/font/google` (the original app referenced `'Inter'` in CSS but never loaded the font file — see `VISUAL_PARITY.md`).
- Centralized the status→color mapping in `src/lib/status-config.ts` so `StatusBadge` has one source of truth.
- Migrated the 8 lowest-risk screens to real Next.js routes (native App Router file-based routing, no client-side string matching).
- Added a Vitest + React Testing Library test foundation with 6 behavioral tests (8 assert-bearing test cases across 5 files).
- Validated the app end-to-end: `npm install`, `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors/warnings), `npm run test` (8/8 passing), `npm run build` (success, all 9 routes statically prerendered), plus a production-server smoke test confirming correct HTTP status codes and `<title>` tags for every route.
- Left the original Vite app at the repository root completely untouched — it still runs independently via its own `npm run dev` (port 5173).

## Migrated screens

| Screen | Route |
|---|---|
| Landing page | `/` |
| Sign in (visual only) | `/login` |
| Register (visual only) | `/register` |
| Forgot password (visual only) | `/forgot-password` |
| Secure link expired | `/link-expired` |
| Link revoked by creator | `/link-revoked` |
| Permission denied (403) | `/permission-denied` |
| Server error (500) | `/server-error` |
| Not found (new — no Vite equivalent) | any unmatched URL |
| Error boundary (new — no Vite equivalent) | uncaught render errors |

## Migrated components

- `StatusBadge` (`src/components/ui/status-badge.tsx`) + centralized config (`src/lib/status-config.ts`)
- `Toast` (`src/components/ui/toast.tsx`) + local-state hook (`src/hooks/use-toast-message.ts`)
- `Button` / `LinkButton` (`src/components/ui/button.tsx`, `link-button.tsx`, `button-variants.ts`) — variants: primary, secondary, outline, ghost
- `PageContainer` (`src/components/layout/page-container.tsx`)
- `PublicNav` (`src/components/layout/public-nav.tsx`)
- `PublicFooter` (`src/components/layout/public-footer.tsx`)
- `SystemStateLayout` (`src/components/layout/system-state-layout.tsx`)
- `AuthForm` (`src/components/auth/auth-form.tsx`) — visual-only login/register/forgot-password form, parameterized by `mode`

## Deferred components

Everything tied to creator/client data, mutation, or the old `AppContext`, including but not limited to:

- `CreatorLayout`, `ClientReviewLayout` (creator sidebar / client portal shells — not needed until dashboard/portal screens are in scope)
- Workspace cards, file cards, comment threads, activity-log rows, payment tables, notification rows, admin tables
- The 5-step `NewWorkspaceWizard`
- Any data-fetching or mutation hook — none exist yet; `AppContext` was intentionally not ported (see Technical Audit §16–17)

## Deferred routes

- `/dashboard`
- `/workspaces`, `/workspaces/new`, `/workspaces/[id]`
- `/clients`
- `/payments`
- `/notifications`
- `/settings`
- `/admin/*`
- `/review/[token]` (secure client portal)

The landing page's two hero CTAs (`/dashboard`, `/review/sec_tok_brand_identity_99`) intentionally still point at these not-yet-built routes, preserving the original's click targets; they currently resolve through `not-found.tsx`, which is the expected, honest behavior for this phase.

## Known issues

- **Landing-page CTA buttons resolve to 404.** Expected and documented (see above) — not a bug, a scope boundary. Will self-resolve once Phase 2 adds `/dashboard` and the review portal.
- **No automated visual-regression/screenshot-diff tooling was set up.** Parity was verified by (a) line-by-line comparison of every color/spacing/radius value against the original source, and (b) a production-server HTTP smoke test of every route. A pixel-diffing tool (e.g. Playwright screenshot comparison) would strengthen this for Phase 2 onward.
- **`npm audit` reports pre-existing high-severity advisories** in `create-next-app`'s default dependency tree (unrelated to any code written in this phase — same baseline any fresh `create-next-app` scaffold would have). Not addressed in this phase per the "don't install backend/unrelated dependencies" boundary; worth a dedicated dependency-audit pass before Phase 2 ships anything security-sensitive.
- **`jsdom@30` reports an `EBADENGINE` warning** against the current Node version (24.6.0 vs. its stated `^22.22.2 || ^24.15.0 || >=26.0.0` range) during `npm install`. It did not affect test execution (all tests pass), but should be revisited if Node is upgraded or the warning becomes an error in a future `jsdom` release.
- **Tailwind's default `slate-*` palette is used directly** (e.g. `slate-100`/`slate-200` for the secondary button, `slate-400`/`slate-500` for muted text on dark backgrounds) rather than being added as named design tokens, because their hex values already coincide exactly with existing design-system colors (`slate-100 = #F1F5F9`, `slate-200 = #E2E8F0`, matching the original `Draft` status background and `--color-border` respectively). Worth promoting to named tokens in Phase 2 if they end up reused frequently, so the token file stays the single source of truth.

## Recommended Phase 2 scope

Following the phased plan in `TECHNICAL_AUDIT.md` §18, the next lowest-risk increment is:

1. **Creator shell + read-only dashboard screens** — `CreatorLayout` (240px sidebar, sticky header, mobile bottom nav — dimensions are already reserved as tokens in `globals.css`: `--spacing-sidebar`, `--spacing-header`, `--spacing-mobile-nav`), then `CreatorDashboard`, `WorkspacesList`, `ClientsManagement`, `PaymentsDashboard`, `NotificationsPage` as Server Components reading from **seeded mock data** (ported from `src/data/mockData.js`, not yet a database) — no mutations yet.
2. Add a Playwright (or similar) screenshot-diff check against the Vite app for the newly migrated screens, now that there's real UI density to protect against regressions as Phase 2+ introduces more interactivity.
3. Only after the read-only creator surface is validated: begin the data-model work (Prisma schema, seed data matching `mockData.js`) that Phase 3 (creator mutations) will depend on — still with no real auth/payments per the original phased plan.

Do not begin any of the above until Phase 1 is explicitly reviewed and approved.

---

## Phase 2

### Phase 2 objective

Migrate the creator application shell and five read-only creator screens (Dashboard, Workspaces, Clients, Payments, Notifications) into the Next.js app, backed by centralized typed mock data — no database, auth, file uploads, payments, or mutations. Add a Playwright visual-regression foundation and expand the unit/component test suite. The original Vite app remains the visual reference and was not modified.

### Completed work

- Added a `(creator)` **route group** (`src/app/(creator)/`) with one shared `layout.tsx` — a Next.js route group never adds a URL segment, so `/dashboard`, `/workspaces`, `/clients`, `/payments`, `/notifications` are exactly where the brief requires, with no `/creator` prefix.
- Built the full creator application shell: 240px desktop sidebar, sticky desktop header, and — for mobile — a compact header with a slide-in navigation drawer plus the original's fixed bottom nav. See `CREATOR_COMPONENT_MAP.md` for the full component breakdown.
- Corrected the responsive breakpoint used for the sidebar/mobile-nav switch: Tailwind's stock `md:` is `768px` (min-width), but the original CreatorLayout.jsx switches to mobile at `max-width: 768px` / desktop at `min-width: 769px`. Left as Tailwind's default, a 768px-wide device would have rendered the *desktop* sidebar where the approved design shows the *mobile* bottom nav. Fixed by overriding `--breakpoint-md` to `769px` in `globals.css`, restoring exact parity at the 768px boundary (see `VISUAL_PARITY.md`).
- Introduced fully typed, centralized mock data (`src/types/*`, `src/data/mock/*`) replacing `AppContext.jsx`/`mockData.js` for this phase's scope — see "Mock-data architecture" below.
- Added pure formatting/derivation helpers (`src/lib/format-currency.ts`, `format-date.ts`, `format-relative-time.ts`, `search.ts`, `workspace-progress.ts`, `dashboard-metrics.ts`, `client-metrics.ts`, `payment-metrics.ts`, `demo-clock.ts`) — every number shown on screen is computed from mock records through one of these, never hardcoded in JSX.
- Migrated Dashboard, Workspaces, Clients, Payments, and Notifications as described below.
- Extended `src/lib/status-config.ts` was **not** needed — every status string used in Phase 2 (workspace statuses, payment statuses `Completed`/`In Review`, client status `Active`) already had a mapping; `Pending Approval` intentionally falls through to the same default gray the original used for unmapped statuses.
- Set up Vitest component/unit tests: 35 tests across 15 files (12 new for Phase 2), covering all 10 required behaviors (see "Unit tests added" below).
- Set up Playwright (`@playwright/test`, Chromium) for visual regression: `playwright.config.ts`, `e2e/visual/*.spec.ts`, 15 baseline screenshots (5 routes × 3 viewports) — see "Visual-test status" below.
- Validated the app end-to-end: `npm install`, `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors/warnings), `npm run test` (35/35 passing), `npm run test:visual` (15/15 passing), `npm run build` (success, all 13 static routes), plus a manual production-server route/HTML smoke test.

### Creator routes completed

| Route | Screen | Rendering |
|---|---|---|
| `/dashboard` | Creator dashboard | Server Component |
| `/workspaces` | Workspaces directory | Server page + Client `WorkspaceExplorer` for search/filter |
| `/clients` | Clients directory | Client Component (`ClientExplorer`) |
| `/payments` | Payments & revenue ledger | Server page + Client `PaymentExplorer` for filters/summary |
| `/notifications` | Notifications feed | Server page + Client `NotificationsList` for the local read/unread toggle |

### Creator components completed

See `CREATOR_COMPONENT_MAP.md` for the complete, per-component table (source, location, Server/Client, data source, reused children). Summary: 8 shell components, 5 shared UI primitives, 3 workspace components, 3 client components, 3 payment components, 2 notification components, 1 dashboard-only component (`ActivityItem`).

### Mock-data architecture

- `src/types/*` — explicit interfaces (`Creator`, `Workspace`, `Client`, `Payment`, `Notification`, plus sub-types like `WorkspaceComment`/`ActivityLogEntry`), re-exported from `src/types/index.ts`.
- `src/data/mock/*` — one file per entity (`creator.ts`, `clients.ts`, `workspaces.ts`, `payments.ts`, `notifications.ts`) plus `dashboard.ts` (computed summary/activity, not hand-authored) and an `index.ts` barrel.
- Content is ported from the original `src/data/mockData.js` almost verbatim, with two intentional, documented additions:
  1. A fourth workspace, **"Social Media Campaign"** (client: Ananya Kapoor, status `Draft`), added because it was explicitly named in this phase's example content list but didn't exist in the original 3-workspace mock set. Ananya's `activeWorkspaces`/`status` fields were updated from the original's `(0, "Inactive")` to `(1, "Active")` to stay internally consistent with her now having a live workspace.
  2. Three additional notification examples (`changes_requested`, `download`, `preview_failed` types) added because the original `MOCK_NOTIFICATIONS` only had 4 entries covering `comment`/`approval`/`payment`/`view`, and this phase's brief explicitly named all six-plus types.
- **No `AppContext` equivalent was created.** Server Component pages import mock arrays directly; Client Components (`WorkspaceExplorer`, `ClientExplorer`, `PaymentExplorer`, `NotificationsList`) receive them as props and hold only their own local UI state (search term, filter selection, local read/unread toggle) — never a shared/global mutable store.
- Dashboard figures (`DASHBOARD_SUMMARY`, `RECENT_ACTIVITY`) are **computed**, not authored: `src/lib/dashboard-metrics.ts` derives every figure from `WORKSPACES`, so they can never drift out of sync with the underlying records.

### Deferred interactions

Per the phase boundary, the following are visibly present in the UI (for visual parity) but do nothing beyond showing an "available in a later phase" toast, or are disabled with an accessible reason — **never** a fake success state:

| Action | Where | Behavior |
|---|---|---|
| Add New Client | `/clients` | Toast: "Adding a new client is available in a later phase." |
| Edit / Delete client | `/clients` (table + card) | Toast naming the client, e.g. "Editing Rohit Sharma is available in a later phase." |
| Receipt | `/payments` (table + card) | Disabled (with `title`) for non-`Completed` payments; toast for `Completed` ones |
| "Open Client Portal View" | Creator header (all creator pages) | `disabled` button with an explanatory `title` — the destination (`/review/[token]`) is deferred, so unlike the workspace-row links this has no route to point at yet |
| Notification read/unread | `/notifications` | Local component state only (resets on refresh), explicitly labelled "for preview purposes only" above the list — the original had this as a real (if simple) mutation via `AppContext`; kept as a *visual-only* toggle rather than removed entirely, since it was a core part of the approved interaction |
| "Mark all as read" | `/notifications` | **Not built** — the original `NotificationsPage` never had this control (checked against source); adding it would have been a new feature, not a migration |

Workspace-row actions ("Manage", "Portal") are **not** in this table — they're real `<Link>`s to `/workspaces/[id]` and `/review/[token]`, which are deferred *routes* (not actions), so they follow the same pattern as Phase 1's landing-page CTAs: they resolve through `not-found.tsx` today, which is expected.

### Deferred routes

Unchanged from Phase 1's list, minus the five now completed:

- `/workspaces/new`, `/workspaces/[id]`
- `/settings`
- `/admin/*`
- `/review/[token]` (secure client portal)

`/settings` remains in the nav (both desktop sidebar and the new mobile drawer) as a visible, correctly-labelled link — clicking it resolves through `not-found.tsx`, consistent with how every other deferred route is handled in this project.

### Known differences

- **Mobile navigation drawer is new** — the original `CreatorLayout.jsx` had no drawer or hamburger menu; on mobile, its bottom nav only ever showed 5 of the 6 nav items (`navItems.slice(0, 5)`), and **Settings was completely unreachable below 768px** in the approved design. This phase's brief explicitly requires "a mobile menu or drawer for secondary navigation" and keyboard-operable/`Escape`-to-close behavior, so a drawer (`CreatorMobileHeader`) was added — a deliberate, brief-mandated addition to the original, not a visual redesign of anything that existed. The bottom nav itself is otherwise pixel-for-pixel identical (same 5 items, same order, same 60px height).
- **`--breakpoint-md` changed from Tailwind's default 768px to 769px** (see "Completed work" above) — a correctness fix, not a design change; it makes the *approved* 768px behavior actually happen at 768px.
- **"Open Client Portal View" is disabled**, where the original let it navigate straight into a hardcoded demo client-portal link. Since `/review/[token]` isn't built yet, this avoids either faking a working link or silently dropping the button from the approved header.
- **Workspace/Client "Progress" percentage is a new, derived field.** The original never showed a numeric progress indicator — it only had a status badge and a version badge (e.g. "V2"). This phase's brief explicitly lists "Progress" as required content for workspace rows/cards, so `src/lib/workspace-progress.ts` derives a percentage from `status` (never a separate, independently-editable field, so it can't drift from the status badge next to it).
- **Client "Outstanding" figure is new and derived** (`src/lib/client-metrics.ts`), computed as the sum of that client's unpaid workspace amounts — the original only showed lifetime "Total Spent." Added because the brief explicitly asks for "Outstanding amount" on the Clients screen; "Total Spent" was not carried over since the brief's Clients field list doesn't include it and the Client type's `totalSpent` therefore isn't currently rendered anywhere in Phase 2 (still present on the type/mock data for a future phase).
- **Payment date-range filter uses a fixed reference date** (`src/lib/demo-clock.ts`, `DEMO_TODAY = "2026-07-28"`, matching the mock data's most recent dates) instead of the real system clock, specifically so filtered results — and any screenshot of them — never change from one test run to the next.
- **`ClientTable` and `PaymentCard`/`PaymentTable` are new components** — the original `ClientsManagement` only ever rendered cards (no table), and `PaymentsDashboard` only ever rendered a table (no mobile card). Both were added so each screen has a real desktop-table + mobile-card pair, consistent with every other migrated screen and with this phase's explicit "desktop table layout" + "mobile stacked-card layout" requirements.

### Visual-test status

- Playwright (`@playwright/test` + Chromium) is configured in `playwright.config.ts`, running against a production build (`next build && next start`) rather than `next dev`, so screenshots never include dev-mode overlays.
- 5 routes × 3 viewports (desktop 1440×900, tablet 768×1024, mobile 390×844) = **15 baseline screenshots**, all committed under `e2e/visual/*.spec.ts-snapshots/`, all currently passing (`npm run test:visual` → 15/15).
- Determinism safeguards: remote avatar images (`images.unsplash.com`) are intercepted and replaced with a static 1×1 PNG (`e2e/visual/utils.ts`) so screenshots never depend on network access or a third-party CDN; all page content comes from static mock data (no timers, no random values); `animations: "disabled"` is set globally in `expect.toHaveScreenshot`; date-range filtering uses the fixed `DEMO_TODAY` reference instead of the system clock.
- Screenshots are **viewport-only, not full-page** — an early full-page attempt revealed a Playwright stitching artifact where `position: fixed` elements (the bottom nav) get duplicated mid-page; a single viewport capture already shows the complete visible page for this app's fixed-header/fixed-nav shell, without that artifact.
- Not yet covered: the mobile drawer open state, any hover/focus states, and the empty/no-results states (all of which are reachable only through interaction, not the default page load) — worth adding in Phase 3 if the visual-regression net needs to widen alongside new interactive surface.

### Unit tests added (Phase 2)

12 new test files (23 new test cases) mapped to the 10 required behaviors:

1. Creator navigation renders expected links → `creator-navigation.test.tsx`
2. Active creator navigation state follows the route → `creator-navigation.test.tsx`
3. Dashboard renders calculated metric values → `dashboard/page.test.tsx`
4. Workspace filtering returns matching records → `workspace-explorer.test.tsx`
5. Workspace no-results state appears correctly → `workspace-explorer.test.tsx`
6. Client search returns matching clients → `client-explorer.test.tsx`
7. Payment status rendering uses centralized configuration → `payment-table.test.tsx`
8. Notification unread state has accessible text → `notification-item.test.tsx`
9. Mobile creator navigation renders expected primary destinations → `creator-mobile-nav.test.tsx`
10. Currency formatter correctly formats INR values → `format-currency.test.ts`

Plus additional pure-helper coverage per "test pure filtering and formatting helpers separately": `search.test.ts`, `dashboard-metrics.test.ts`.

### Recommended Phase 3 scope

Following `TECHNICAL_AUDIT.md` §18's phased plan, now that the full read-only creator surface exists:

1. **Workspace detail page** (`/workspaces/[id]`) — the highest-value next screen, since both the dashboard and workspaces list already link to it. Still read-only: file list, comments (read-only), activity log, payment-gate summary — no mutations yet.
2. **Creator mutations as Server Actions** — starting with the lowest-risk ones from `TECHNICAL_AUDIT.md` Phase 3 (resolve comment, copy client link with a real clipboard call) once a real data layer (Prisma + Postgres, seeded from `src/data/mock/*`) exists to write to.
3. Extend the Playwright visual suite to cover the mobile drawer's open state and the empty/no-results states now that there's a real data layer to point it at zero-record scenarios instead of only the seeded demo set.
4. Only after the above: begin auth (Auth.js) for the creator login flow, since every creator screen currently assumes a single hardcoded creator identity with no session boundary.

Do not begin any of the above until Phase 2 is explicitly reviewed and approved.

---

## Phase 3

### Phase 3 objective

Replace creator mock-data reads with secure PostgreSQL-backed queries via Prisma, and implement real creator authentication (registration, credentials login, logout, session handling, protected routes, creator-level data isolation) — while keeping every creator screen's approved visuals unchanged. No workspace/client mutations, file uploads, payments, comments, or secure review links yet. Full architecture reasoning lives in `AUTH_DATABASE_ARCHITECTURE.md`; hands-on setup lives in `DATABASE_SETUP.md`.

### Completed work

- **Database:** PostgreSQL 16 via Docker Compose (`docker-compose.yml`, host port 5433), Prisma 7 with the driver-adapter model (`@prisma/adapter-pg`), schema in `prisma/schema.prisma` (7 models, 4 enums, decisions on cascade behavior documented inline), one migration (`prisma/migrations/20260728051026_init`), deterministic seed (`prisma/seed.ts`) for two creators.
- **Auth:** Auth.js (next-auth v5 beta) with a Credentials provider, JWT sessions, no adapter — real registration (Zod-validated, bcrypt-hashed, transactional duplicate-email prevention), real login (generic failure message), real logout (Server Action, ends the session server-side).
- **Route protection, two layers:** `src/proxy.ts` (optimistic, cookie-only, no DB) + `src/app/(creator)/layout.tsx` and every `src/data-access/*` function (definitive, re-reads the session from the database, scopes every query by `creatorId`).
- **Data-access layer:** `src/data-access/{auth,credentials,users,dashboard,workspaces,clients,payments,notifications}.ts` — one small module per concern, all creator-scoped queries derive `creatorId`/`userId` from the authenticated session, `passwordHash` is selected nowhere except `verifyCredentials()`.
- **All five creator routes converted from mock data to database reads**, with URL-search-param-backed filters (`q`, `status`, `client`, `sort`, `date`) validated/normalized server-side (`src/lib/search-params.ts`) — see "Database-backed routes" below.
- **Decimal-safe money throughout:** `src/lib/decimal.ts` (`sumDecimals`/`toDecimal`/`toDisplayNumber`) — every intermediate calculation stays in Prisma's `Decimal` type; conversion to a plain `number` happens exactly once, at the display boundary.
- **`loading.tsx` and `error.tsx`** added for the `(creator)` route group — a shared skeleton loading state and a generic error boundary that never surfaces a raw Prisma/SQL message to the user (logs via `console.error` only).
- **Authenticated creator identity** replaces hardcoded mock identity throughout the shell: `CreatorProfile` now shows the real session's name/email, with an initials fallback when there's no profile image, and a real `<form action={logoutAction}>` (not a link) for logout.
- **Testing, three tiers:**
  - Unit (Vitest, mocked Prisma/Auth.js, jsdom): 75 tests across 22 files, including all 10 explicitly required behaviors (see below).
  - Integration (Vitest, real Postgres test database): 11 tests in `src/data-access/isolation.integration.test.ts`.
  - E2E (Playwright, real dev database): 6 functional auth-flow tests + 24 visual-regression screenshots (1 legitimately skipped — see below).
- Validated end-to-end manually too: real `curl`-based login/logout against a running production build, confirming session cookies, redirect behavior, and creator-data isolation before writing any tests.

### Authentication strategy

JWT sessions, Credentials provider, no database adapter — see `AUTH_DATABASE_ARCHITECTURE.md` for the full reasoning (short version: Auth.js's database session strategy isn't supported with Credentials; JWT plus a from-scratch `User` model keeps exactly one source of truth for creator accounts instead of two competing ones).

### Protected routes

`/dashboard`, `/workspaces`, `/clients`, `/payments`, `/notifications`, and any future route added to the `(creator)` route group. Public routes (`/`, `/login`, `/register`, `/forgot-password`, the four system-state pages) remain accessible without a session; `/login` and `/register` redirect an already-authenticated visitor to `/dashboard`.

### Database-backed routes

| Route | Data-access module | Filters (URL params) |
|---|---|---|
| `/dashboard` | `dashboard.ts` | none (fixed "recent" slices) |
| `/workspaces` | `workspaces.ts` | `q`, `status`, `client`, `sort` |
| `/clients` | `clients.ts` | `q` |
| `/payments` | `payments.ts` | `status`, `date` |
| `/notifications` | `notifications.ts` | none (matches the original's lack of filters) |

Pagination was **not** added — the approved UI never had it (same call made in Phase 2 for the same reason), and the brief's pagination requirement was explicitly conditional on it existing in the approved UI.

### Mock files now obsolete for production routes

`src/data/mock/*` and `src/types/*` (the Phase 2 mock data and hand-written types) are no longer imported by any production route — every creator page now reads from `src/data-access/*`, which defines its own DB-shaped types locally. They're kept in the repo because:

- Some Phase 2-era tests still exercise the mock-data pure helpers directly (`src/lib/dashboard-metrics.ts` + `dashboard-metrics.test.ts`, `src/lib/client-metrics.ts` — now fully unreferenced by any component, kept as a historical reference for the "derive metrics instead of storing them" pattern that `src/data-access/clients.ts` now does against real data instead).
- `prisma/seed.ts`'s content was authored by hand to match the mock data's values (not by importing it programmatically), so the mock files remain useful as the "what should this look like" reference if the seed ever needs to be re-derived.

No production code path reads them anymore; a future phase can delete them once nothing still asserts against their pure-function tests.

### Ownership controls

Every creator-scoped Prisma query is built from a `creatorId`/`userId` obtained via `requireAuthenticatedUser()` (`src/data-access/auth.ts`), which itself re-reads the current session and re-fetches the user row from Postgres — never from a URL param, form field, or function argument. Verified three ways:
1. Unit: `src/data-access/scoping.test.ts` mocks Prisma and asserts the `where` clause always contains the session's `creatorId`, even when a caller tries to smuggle a different one through raw params.
2. Integration: `src/data-access/isolation.integration.test.ts` proves against the real seeded database that Arjun cannot see Meera's clients/workspaces/dashboard totals, and vice versa.
3. Manual: a `curl`-based login as Arjun, followed by fetching `/dashboard`/`/clients`, confirmed Meera's seeded client "Devika Nair" never appears.

### Unit tests added (Phase 3)

Mapped to the 10 explicitly required behaviors:

1. Email normalization → `src/lib/normalize-email.test.ts`
2. Registration validation → `src/lib/validation/auth.test.ts`
3. Duplicate-email handling → `src/actions/auth.test.ts`
4. Generic invalid-login behavior → `src/actions/auth.test.ts`, `src/components/auth/login-form.test.tsx`
5. Currency conversion from Prisma Decimal to view models → `src/lib/decimal.test.ts`
6. Creator data-access scoping → `src/data-access/scoping.test.ts`
7. Dashboard metrics from database-shaped records → `src/lib/dashboard-summary.test.ts`
8. Protected creator-layout behavior → `src/data-access/auth.test.ts` (`requireAuthenticatedUser`/`requireCreatorRole` redirect logic)
9. Authenticated creator profile rendering → `src/components/creator/creator-profile.test.tsx`
10. Logout form/action rendering → `src/components/creator/creator-profile.test.tsx` (form/button assertions), `src/actions/auth.test.ts` (`logoutAction` calls `signOut`)

Plus several Phase 2 tests updated in place to match the new DB-shaped props (`client-explorer.test.tsx`, `payment-table.test.tsx`, `notification-item.test.tsx`) rather than the old mock types, and the Phase 2 `dashboard/page.test.tsx` removed (the page is now `async` and hits the database — its coverage moved to `dashboard-summary.test.ts`, a pure-function unit test, plus the Phase 3 integration suite).

### Integration tests added

`src/data-access/isolation.integration.test.ts`, against the dedicated `project_vault_test` database:
1. `createUser` persists a bcrypt hash, and the raw password verifies against it.
2. Duplicate email (case-insensitive) is rejected.
3. `verifyCredentials` authenticates with the real seeded demo password.
4. `verifyCredentials` is case-insensitive on email.
5. `verifyCredentials` fails generically (returns `null`) for a wrong password.
6. `verifyCredentials` fails generically (the same `null`) for a non-existent email.
7. Arjun cannot query Meera's clients.
8. Meera cannot query Arjun's clients.
9. Arjun cannot query Meera's workspaces.
10. Dashboard metrics for Arjun total exactly his seeded records (₹1,18,000 across 4 workspaces).
11. Dashboard metrics for Meera total exactly her seeded records (₹37,000 across 2 workspaces).

### Playwright auth E2E tests added

`e2e/auth/auth-flow.spec.ts` (run serially — see "Known issues"):
1. Unauthenticated `/dashboard` redirects to `/login`.
2. A valid demo login reaches `/dashboard`.
3. An invalid login shows the generic error and does not reach the dashboard.
4. Logout ends the session (verified by re-requesting `/dashboard` afterward, not just checking the redirect target) and returns to `/`.
5. The authenticated creator's real name/email display, not a hardcoded identity.
6. A hard page refresh on a protected route keeps the session authenticated.

### Visual baselines added/changed

All 15 Phase 2 baselines were **regenerated** (not just added to) — they were silently wrong after Phase 3 shipped, since `/dashboard` etc. are now protected routes and would have screenshotted the login redirect instead of real content. A `setup` Playwright project now logs in once as the seeded demo creator and shares that session (`e2e/visual/.auth/creator.json`, gitignored) across the three viewport projects.

New baselines (8, one shown at desktop/tablet/mobile except the drawer):
- Login validation-error state (`login-validation.spec.ts`) — uses a deliberately logged-out context (`storageState: { cookies: [], origins: [] }`), since this is the one visual spec testing a public page.
- Mobile navigation drawer open state (`mobile-drawer.spec.ts`) — skipped on the `desktop-1440` project (no hamburger/drawer exists there), so this is 2 baselines, not 3.
- Workspaces no-results empty state (`workspaces-empty.spec.ts`) — reached via `?q=zzz-no-such-workspace-zzz` rather than a separate zero-data creator account.

Total: 24 passing visual checks + 6 passing auth-flow checks = 30 Playwright tests.

### Known issues

- **`e2e/auth/auth-flow.spec.ts` runs serially** (`test.describe.configure({ mode: "serial" })`). Running its 6 tests fully parallel against the one shared dev-server process Playwright starts was flaky in this environment specifically around the logout test — a `page.goto("/dashboard")` immediately after a client-side-observed URL change to `/` would occasionally still see an authenticated session. The underlying logout mechanism itself was verified correct three independent ways (a serial Playwright run, a direct `/api/auth/signout` REST call via `curl`, and a Playwright run using `page.waitForURL` instead of `expect().toHaveURL`) — this reads as test-concurrency contention against a single server process under this sandboxed environment's load, not a broken feature. Worth revisiting if the suite ever needs to run in true parallel (e.g., against a load-balanced set of server instances).
- **`AUTH_URL` is deliberately unset** in `.env`/`.env.example` (see `AUTH_DATABASE_ARCHITECTURE.md`) — an earlier draft hardcoded it to port 3000, which broke every Auth.js redirect when Playwright's test server ran on a different port. `trustHost: true` plus no fixed `AUTH_URL` fixed it for local dev/testing; revisit for a real deployment behind a fixed domain.
- Auth security hardening (email verification, password reset, rate limiting/brute-force protection, MFA, OAuth, secret rotation) is explicitly deferred — see `AUTH_DATABASE_ARCHITECTURE.md`'s security section. This phase's auth is real but not production-hardened.
- `getAuthenticatedCreator()` is wrapped in React's `cache()`, which only de-dupes within a single render pass by design — this is correct for Next.js's per-request scoping, but be aware of it if `src/data-access/auth.ts` is ever unit-tested again: `cache()`'s memoization persists across `it()` blocks within the same Vitest module instance unless `vi.resetModules()` is called between tests (see the comment in `src/data-access/auth.test.ts`).

### Recommended Phase 4 scope

Following `TECHNICAL_AUDIT.md`'s phased plan, now that real auth + a real (read-only) data layer exist:

1. **Workspace detail page** (`/workspaces/[id]`) — still read-only (files list, comments read-only, activity log, payment-gate summary), now backed by the real `Workspace`/`ActivityLog`/`Payment` tables instead of deferred/mock.
2. **First real mutations as Server Actions** — the lowest-risk ones (resolve a comment once comments exist, copy the client link with a real clipboard call) — each with its own authorization check close to the mutation, not just at the route boundary, per the same pattern `src/data-access/*` already establishes for reads.
3. **Client creation/editing** — the `/clients` page's "Add/Edit/Delete" buttons already exist and are wired to deferred-action toasts; this is the natural next screen to make real, since the schema (`Client` model) is already in place.
4. Only after the above: begin the file-storage-adjacent work (uploads, previews, watermarking) that the secure client review portal depends on.

Do not begin any of the above until Phase 3 is explicitly reviewed and approved.

---

## Phase 4

### Phase 4 objective

Implement the first real authenticated creator mutations as Server Actions: workspace details, client create/edit/delete, workspace create/edit/cancel, and full transactional activity logging — while keeping every approved visual (forms, five-step wizard, tabs, confirmation dialogs) unchanged. File upload, comments, client review, and payment processing remain explicitly out of scope. Full architecture reasoning lives in `MUTATION_ARCHITECTURE.md`.

### Completed work

- **Schema:** one migration (`prisma/migrations/20260728065323_phase4_client_workspace_mutations`) adding `Workspace.watermarkText`/`cancelledAt` and extending `ActivityLog` with a nullable `workspaceId` plus new `clientId`/`creatorId` columns — see `MUTATION_ARCHITECTURE.md` → "Activity logging" for why (schema-change option A from the brief) and `DATABASE_SETUP.md` for the hands-on migration note.
- **Validation:** `src/validation/client.ts`, `src/validation/workspace.ts` (Zod, server-authoritative, decimal-safe amount string).
- **Authorization:** `src/data-access/authorization.ts` (`requireOwnedClient`, `requireOwnedWorkspace`, `requireClientAvailableToCreator`) — centralized so no mutation re-implements an ownership check.
- **Activity logging:** `src/lib/activity-log.ts` (centralized action codes + `formatActivityLabel` formatter) and `src/data-access/activity.ts` (`recordActivity`, always called inside the mutation's own transaction).
- **Data access:** `src/data-access/clients.ts` extended with `getClientOptionsForCreator`, `getOwnedClientForEdit`, `createClient`, `updateOwnedClient`, `deleteOwnedUnusedClient`; `src/data-access/workspaces.ts` extended with `getOwnedWorkspaceDetail`, `getOwnedWorkspaceForEdit`, `createWorkspace`, `updateOwnedWorkspace`, `cancelOwnedWorkspace`, `deleteOwnedDraftWorkspace`.
- **Server Actions:** `src/actions/clients.ts`, `src/actions/workspaces.ts` — see `MUTATION_ARCHITECTURE.md` → "Server Action structure" for the shared error-handling/redirect/flash-toast pattern.
- **New routes:** `/clients/new`, `/clients/[id]/edit`, `/workspaces/new` (real five-step wizard, replacing the deferred placeholder), `/workspaces/[id]` (real workspace details, Overview/Files/Comments/Payment/Activity tabs), `/workspaces/[id]/edit`.
- **New/changed components:** `ClientForm`, `WorkspaceWizard`, `WorkspaceEditForm`, `WorkspaceDetailTabs`, `WorkspaceActions`, `ConfirmDialog` (generic, reused for client delete + workspace cancel/delete), `FlashToast`; `ClientCard`/`ClientTable` now perform real Edit (link) and Delete (confirm dialog) instead of showing a deferred-action toast.
- **Testing, three tiers plus visual:**
  - Unit (Vitest, mocked Prisma/session): `src/validation/{client,workspace}.test.ts`, `src/lib/activity-log.test.ts`, `src/lib/decimal.test.ts` (extended), `src/data-access/mutations.test.ts` — 48 new test cases across 5 files.
  - Integration (Vitest, real Postgres test database): `src/data-access/mutations.integration.test.ts` — 12 tests covering the full client/workspace CRUD + ownership-boundary + activity-log-on-success/none-on-failure matrix.
  - E2E (Playwright, real dev server + database): `e2e/mutations/mutations.spec.ts` — 11 functional tests (see `MUTATION_ARCHITECTURE.md` → "Testing" for why this is one file, not two).
  - Visual (Playwright): 18 new baselines (6 new specs × 3 viewports) for the client forms, confirm dialog, workspace wizard, and workspace details tabs.
- Validated end-to-end: `npm install`, `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors/warnings), `npm run test`, `npm run test:integration`, `npx playwright test --project=mutations-e2e`, the visual/auth Playwright projects, and `npm run build` — see the Phase 4 completion report for exact results.

### Deferred interactions now real

Per `CREATOR_COMPONENT_MAP.md`'s Phase 2/3 "Deferred interactions" table:

| Action | Where | Phase 2/3 behavior | Phase 4 behavior |
|---|---|---|---|
| Add New Client | `/clients` | Toast: "available in a later phase" | Real navigation to `/clients/new`, real creation |
| Edit client | `/clients` | Toast naming the client | Real navigation to `/clients/[id]/edit`, real update |
| Delete client | `/clients` | Toast naming the client | Real confirm-dialog deletion, blocked (with a clear message) if the client has workspaces |
| "New Workspace Flow" | Dashboard, `/workspaces` | Linked to the deferred `/workspaces/new` (resolved via `not-found.tsx`) | Real five-step wizard, creates a real `DRAFT` workspace |
| Workspace row "Manage" | `/workspaces`, dashboard | Linked to the deferred `/workspaces/[id]` (resolved via `not-found.tsx`) | Real workspace details page |

Still deferred, unchanged: "Open Client Portal View" / workspace row "Portal" (both need `/review/[token]`), notification read/unread persistence, Settings, Admin.

### Known differences / deliberate scope boundaries

- **Deliverables step (wizard step 2) is visually present but inert** — clearly labelled "Secure file upload is coming in Phase 5," no browser `File` object, base64 payload, or simulated upload is ever stored. A workspace is always created as a files-less `DRAFT`.
- **Share Secure Link stays disabled** on workspace details, with an explanatory `title` — no `publicToken` is generated by any Phase 4 action, since real client-review token issuance is a later phase.
- **Comments and Files tabs show honest empty states**, not fake content — see `MUTATION_ARCHITECTURE.md` for the exact copy and reasoning.
- **Currency is currently a single-option field (`INR` only)** — see `MUTATION_ARCHITECTURE.md` → "Validation strategy" for why (every currency-display helper in this app is hardcoded to ₹/en-IN; the two are kept in lockstep rather than half-shipping multi-currency).
- **Workspace permanent delete exists but is narrowly scoped** — only an untouched `DRAFT` (no payments, no activity beyond creation) can be hard-deleted; everything else must be cancelled. See `MUTATION_ARCHITECTURE.md` → "Safe deletion rules."

### Recommended Phase 5 scope

Following `TECHNICAL_AUDIT.md`'s phased plan, now that real client/workspace mutations exist:

1. **Object storage & file upload** for the workspace Deliverables step and Files tab — the UI already explains this is coming and creates workspaces without files today, so this is a purely additive next step, not a rework.
2. **Preview generation + watermark rendering**, now that `Workspace.watermarkText` is real, persisted metadata rather than a UI-only field.
3. Only after storage exists: begin the secure client review portal (`/review/[token]`) and Share Secure Link token issuance, which both currently have real, disabled UI waiting for them.

Do not begin any of the above until Phase 4 is explicitly reviewed and approved.

---

## Phase 5

### Phase 5 objective

Implement secure creator file uploads to private S3-compatible object storage, server-side upload verification, a standalone file-processing worker that generates protected watermarked previews for images (and marks PDF/ZIP as locked deliverables), and the real Files-tab UI (drag-and-drop, upload queue/progress, preview, retry, delete) — replacing the Phase 4 placeholder. Client-facing access, comments, approvals, and payments remain explicitly out of scope. Full architecture reasoning lives in `FILE_STORAGE_ARCHITECTURE.md`; hands-on operations live in `FILE_PROCESSING_RUNBOOK.md`.

### Completed work

- **Dependencies:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (storage), `sharp` (image processing), `file-type` (magic-byte content detection).
- **Local infrastructure:** `docker-compose.yml` extended with a `minio` service (S3-compatible storage) and a `minio-init` one-shot bucket-bootstrap service confirming the bucket is private.
- **Schema:** one migration (`prisma/migrations/20260728085350_phase5_file_storage`) adding `FileKind`/`FileStatus`/`ProcessingJobStatus`/`UploadSessionStatus` enums and the `WorkspaceFile`/`FileVersion`/`FileProcessingJob`/`UploadSession` models — see `FILE_STORAGE_ARCHITECTURE.md` → "Database models."
- **Storage abstraction:** `src/storage/{storage-provider,s3-storage-provider,storage-config,storage-keys,signed-urls}.ts` — business logic never imports the AWS SDK directly, only the `StorageProvider` interface.
- **Validation/processing libs:** `src/lib/{filename-sanitize,file-kind,checksum,watermark,image-preview,bytes}.ts` — filename sanitization, MIME/magic-byte allow-listing, SHA-256 checksums, XML-safe watermark SVG generation, Sharp-based preview generation, and safe BigInt↔number byte-count conversion.
- **Data access:** `src/data-access/uploads.ts` (upload-session lifecycle: `createUploadSession`, `completeUploadSession`) and `src/data-access/files.ts` (`getWorkspaceFiles`, `getOwnedFilePreviewUrl`, `retryFileProcessing`, `deleteOwnedFile`), plus `requireOwnedWorkspaceFile` added to `src/data-access/authorization.ts`.
- **Route handlers:** `POST /api/workspaces/[id]/upload-sessions`, `POST /api/upload-sessions/[sessionId]/complete`, `GET /api/files/[fileId]/preview-url` — a real HTTP request/response workflow, not Server Actions, per the brief. `src/lib/api-errors.ts` added so route handlers can safely reuse the same session-derived-auth data-access functions as Server Components without a redirect leaking into a JSON API response.
- **Server Actions:** `src/actions/files.ts` (`retryFileProcessingAction`, `deleteFileAction`) — reuse the same `{error, success}` shape as Phase 4's `ConfirmDialog`.
- **Worker:** `src/worker/process-files.ts` (the `npm run worker:files` entry point — a standalone, long-lived Node process, never part of the Next.js request cycle) + `src/worker/job-processor.ts` (the actual claim/process logic, factored out so it's directly exercised by integration tests). Atomic job claiming via Postgres `FOR UPDATE SKIP LOCKED` — safe for multiple concurrent worker instances.
- **UI:** `src/components/creator/{files-tab,file-card,upload-dropzone,workspace-detail-tabs}.tsx` (the last one updated in place) + `src/hooks/use-file-upload-queue.ts` (client-side upload orchestration with real `XMLHttpRequest` progress events) — replaces the Phase 4 Files-tab placeholder entirely.
- **Activity events:** `FILE_UPLOAD_STARTED`, `FILE_UPLOADED`, `FILE_PROCESSING_COMPLETED`, `FILE_PROCESSING_FAILED`, `FILE_PROCESSING_RETRIED`, `FILE_DELETED` — added to `src/lib/activity-log.ts`'s centralized formatter.
- **A real bug found and fixed during this phase, unrelated to file storage:** the five-step workspace creation wizard's "Continue" button (step 4 → 5) could, under certain click-timing conditions, cause a genuine, unintended workspace submission — see "A wizard bug found during Phase 5 testing" below. Fixed in `src/components/creator/workspace-wizard.tsx`.
- **Testing, four tiers:**
  - Unit (Vitest): filename sanitization, MIME/magic-byte validation (using real `file-type` against real Sharp-generated images), storage-key generation/randomness, XML escaping + watermark SVG generation, watermark configuration, preview dimension-calculation math (real Sharp calls, no mocking), checksum generation/sensitivity, storage-config production guards, upload-limit validation, and file-state/retry-limit transition rules (mocked Prisma) — 9 new test files, ~120 new test cases.
  - Integration (Vitest, real Postgres test DB + real MinIO): `src/data-access/files.integration.test.ts` — 15 tests covering the full upload-session lifecycle (including a real `fetch()` PUT to a real presigned URL), server-side verification (size mismatch, unsupported content), original-file privacy (an unsigned request to the object's URL is rejected), cross-creator preview-access denial, worker-produced preview checksums differing from the original, safe error recording for a genuinely corrupt image, retry re-queuing, atomic concurrent job claiming, and deletion (including the paid-workspace block).
  - E2E (Playwright, real dev server + database + MinIO + worker): `e2e/uploads/uploads.spec.ts` — 10 functional tests against the seeded `ws_social_campaign` workspace: valid upload → Ready, preview opens, no original-download action ever appears, direct-refresh persistence, unsupported-type rejection, oversized-file rejection (against an e2e-configured 2 MB limit), a genuine processing failure (an oversized-*dimension* real JPEG, not a mock) with a working retry, file deletion, and mobile-viewport usability.
  - Visual (Playwright): 5 new specs × 3 viewports — Files-tab empty state (full-page) and, element-scoped (see below), the Ready/preview-open, Processing Failed, locked/preview-unavailable, and file-delete-confirmation states.

### A wizard bug found during Phase 5 testing

While building the file-visual regression baselines, a **pre-existing** bug in the Phase 4 workspace-creation wizard was discovered: clicking "Continue" on step 4 (which only ever renders a `type="button"` element) could, under a specific timing window, result in a real form submission — creating an actual workspace the creator never asked to create. Root cause: the wizard's step-5 submit button and step-4 "Continue" button occupy the *same position* in the JSX tree via a ternary, so React reconciled them as "the same" `<button>` and patched its `type` attribute (`button` → `submit`) **in place** rather than swapping the DOM node — and that patch could land inside the same click-event tick that was also advancing the step, so the browser's native submit-on-click behavior fired against the just-mutated node. Fixed by giving the two branches distinct `key` props, forcing React to mount a genuinely new DOM node per branch instead of mutating one in place. Confirmed fixed via repeated E2E runs (zero unintended workspaces created across dozens of wizard-review-step test executions, versus a stray workspace on nearly every run before the fix). This was **not** a Phase 5 storage/upload issue — it's called out here because it was caught by Phase 5's visual-testing work, and the fix belongs in the historical record for the component it actually touched.

### Known differences / deliberate scope boundaries

- **PDF/ZIP have no visual preview at all** — "locked deliverable" is the complete, honest state for these file kinds in this MVP (filename, size, type, a "Preview not available in this MVP" message). No PDF rendering, no thumbnail extraction.
- **Only one `FileVersion` is ever created per file** — the schema supports multiple versions (a future re-upload/revision workflow), but no UI or action in this phase ever creates a second one.
- **File-related visual baselines are element-scoped, not full-page**, for four of the five new specs — `e2e/visual/files-ready.spec.ts`'s doc comment explains why (the shared seeded workspace they upload into can legitimately contain other in-flight test uploads from concurrently-running viewport projects; scoping to just the test's own `data-testid="file-card"` element keeps the baseline deterministic regardless). The empty-state and delete-confirmation baselines remain full-page (the former is read-only/never mutates; the latter is safe because the native `<dialog>`'s backdrop — made near-opaque during this phase specifically to remove a source of screenshot nondeterminism — fully covers whatever's behind it).
- **`e2e/uploads/uploads.spec.ts` and the file-content visual specs should be run separately from the rest of the Playwright suite** (`--project=uploads-e2e` on its own) — they share the one background worker process with the file-visual specs in `e2e/visual/`, and running everything at once can exceed that single worker's throughput within a screenshot assertion's timeout. This is the same category of accommodation already documented for `mutations-e2e` in `MUTATION_ARCHITECTURE.md`, extended to cover the worker as a second shared, single-instance resource (alongside the shared dev server/database).

### Recommended Phase 6 scope

Following `TECHNICAL_AUDIT.md`'s phased plan, now that files can be securely uploaded, verified, and previewed:

1. **The secure client review portal** (`/review/[token]`) and real Share Secure Link token issuance — both have real, disabled UI already waiting for them, and now have real files/previews to actually show once a client can authenticate against a token.
2. **Client-facing preview access** — a client-scoped equivalent of `getOwnedFilePreviewUrl`, authorized by a validated review token rather than a creator session.
3. Only after the above: comments (tied to the now-real client identity from the review token), approvals, and — last, highest-risk, most scrutiny — Razorpay payments and file unlocking.

Do not begin any of the above until Phase 5 is explicitly reviewed and approved.

---

## Phase 6

### Phase 6 objective

Implement the complete secure client-review workflow — review-link issuance/revocation/regeneration, token-authorized preview access, comments and replies, change requests, file-version re-upload with atomic promotion, revision submission, and approval — without payment processing or original-file unlocking. Full architecture reasoning lives in `CLIENT_REVIEW_ARCHITECTURE.md`; token security specifically lives in `REVIEW_TOKEN_SECURITY.md`.

### Completed work

- **Schema:** one migration (`prisma/migrations/20260728172849_phase6_client_review_workflow`) — removes the unused, insecure `Workspace.publicToken`/`sharedAt` (plaintext token storage), adds `ReviewLinkStatus`/`ReviewAuthorType`/`CommentStatus`/`ChangeRequestStatus`/`ApprovalStatus`/`FileVersionStatus` enums and `ReviewLink`/`ReviewComment`/`ChangeRequest`/`WorkspaceApproval` models, and extends `FileVersion` (`status`, `submittedAt`), `WorkspaceFile` (`pendingVersionId`), and `UploadSession` (`targetFileId`) — see `CLIENT_REVIEW_ARCHITECTURE.md` for the full reasoning behind each addition.
- **Token security:** `src/lib/review-token.ts` (256-bit generation, SHA-256 hashing, shape validation, constant-time comparison helper) + `src/data-access/review-auth.ts` (`authorizeReviewToken` — a trust path entirely separate from creator sessions). See `REVIEW_TOKEN_SECURITY.md`.
- **Workflow transitions:** `src/lib/workspace-transitions.ts` — one centralized allow-list every status-changing function (including Phase 4's pre-existing `cancelOwnedWorkspace`) now routes through.
- **Data access:** `src/data-access/{review-links,review-auth,review-comments,change-requests,revisions,approvals,review-files}.ts`, plus `uploads.ts`/`files.ts` extended for version re-upload and version-history reporting.
- **Server Actions:** `src/actions/{review-links,review-comments,revisions,review}.ts` — creator actions follow the existing `useActionState` pattern from `MUTATION_ARCHITECTURE.md`; client (token-authorized, no session) actions accept the raw token as a hidden form field and re-authorize on every call.
- **Worker:** `src/worker/job-processor.ts` extended to distinguish an original (v1) processing job from a version-upload job (`WorkspaceFile.pendingVersionId`) — atomic promotion on success, zero disturbance to the existing current version on failure.
- **Routes:** `src/app/review/[token]/page.tsx` (the client portal, `dynamic = "force-dynamic"`, `noindex`/`nofollow`), `src/app/api/review/[token]/files/[fileId]/preview-url/route.ts` (token-authorized, submitted-versions-only preview access), `src/app/api/workspaces/[id]/files/[fileId]/versions/upload-sessions/route.ts` (creator version re-upload), `src/app/robots.ts` (new).
- **UI:** `src/components/review/*` (portal, comments panel, request-changes/approve modals, system states — no creator sidebar, real mobile bottom sheet, desktop two-column layout); `src/components/creator/{review-link-panel,comments-tab,change-request-banner}.tsx` (new) and `workspace-actions.tsx`/`workspace-detail-tabs.tsx`/`file-card.tsx` (extended) on the creator side.
- **Activity events:** 15 new `ActivityAction` codes (`REVIEW_LINK_CREATED/REVOKED/REGENERATED/VIEWED`, `COMMENT_ADDED/REPLIED/RESOLVED`, `CHANGES_REQUESTED`, `FILE_VERSION_UPLOAD_STARTED/UPLOADED/PROCESSING_COMPLETED/PROCESSING_FAILED`, `REVISION_SUBMITTED`, `PROJECT_APPROVED`) added to `src/lib/activity-log.ts`'s centralized formatter; `recordActivity`'s `actorType` widened to accept `"CLIENT"` alongside the existing `"CREATOR"`/`"SYSTEM"`.
- **Testing, three tiers:**
  - Unit (Vitest, mocked Prisma): 9 new test files covering token generation/hashing/shape-rejection, the full transition-policy allow/deny matrix, comment/pin-coordinate/reply validation, review-link eligibility/revocation/regeneration, change-request duplicate-prevention, approval snapshot generation/blocking rules, submitted-version filtering, and revision-readiness rules — ~110 new test cases.
  - Integration (Vitest, real Postgres + real MinIO): `src/data-access/review-workflow.integration.test.ts` — 21 tests covering the full creator↔client round trip end to end, including a genuine upload→process→promote/fail cycle for file versions, cross-workspace/cross-creator boundary checks, and activity-log-on-success vs. none-on-failure.
  - E2E/visual (Playwright): see the Phase 6 addendum to this document's testing sections once added — kept isolated from `uploads-e2e`/`mutations-e2e` per the same shared-dev-server/shared-worker constraint already documented for those suites.

### Known differences / deliberate scope boundaries

- **`Workspace.publicToken`/`sharedAt` are gone, not deprecated-in-place** — they stored a plaintext token, which is structurally incompatible with this phase's hash-only requirement. The two places that read `publicToken` for a `/review/[token]` shortcut link (`workspace-card.tsx`, `workspace-table.tsx`) now show a non-clickable "Shared" indicator instead, since a raw token can never be retrieved again after creation.
- **No dedicated "referenced comments" join table for change requests** — the brief's "optionally reference open comments" is handled at the UI/text level (a client-selected comment's text is quoted into the `ChangeRequest.summary`), not a separate relation, matching the "add only what's required" instruction for what is fundamentally a text-composition affordance.
- **Rate limiting remains deferred and documented**, not silently assumed — no request-level throttling exists on comment/reply/change-request/approval submission, matching the equivalent, already-documented Phase 5 gap for upload-session creation.
- **No email verification, no client accounts, no OTP** — a link holder is "a reviewer with access to the link," never a cryptographically verified individual; see `REVIEW_TOKEN_SECURITY.md`'s "Identity limitations."
- **Payment/unlocking is completely absent, on purpose** — no Razorpay integration, no `PAYMENT_PENDING`/`PAID`/`FILES_UNLOCKED` transitions exist in `workspace-transitions.ts`'s allow-list at all; approval only ever reaches `APPROVED`.

### Recommended Phase 7 scope

Following `TECHNICAL_AUDIT.md`'s phased plan, now that the full review→comment→change-request→revision→approval loop is real:

1. **Razorpay payment integration** — order creation, payment verification, webhooks — gated behind the now-real `APPROVED` workspace status.
2. **File unlocking** — `PAYMENT_PENDING → PAID → FILES_UNLOCKED → DELIVERED` transitions (deliberately absent from `workspace-transitions.ts` today), plus real original-file download access once `FILES_UNLOCKED`.
3. **Email delivery** for review-link sharing and payment confirmations — deferred in every phase so far, including this one.
4. Only after the above: the optional email-verification hardening `REVIEW_TOKEN_SECURITY.md` describes as a future, non-breaking addition.

Do not begin any of the above until Phase 6 is explicitly reviewed and approved.

---

## Phase 7

### Phase 7 objective

Implement the complete verified payment-to-delivery workflow: Razorpay payment-order creation, Checkout signature verification, webhook-verified payment capture, a centralized idempotent finalization service, a standalone delivery-bundle worker, hash-at-rest secure download grants, and individual/bundle original downloads — gated behind the now-real `APPROVED` workspace status from Phase 6. No emails, refunds, tax invoices, or production deployment in this phase. Full architecture reasoning lives in `PAYMENT_ARCHITECTURE.md`, `WEBHOOK_SECURITY.md`, and `SECURE_DOWNLOAD_ARCHITECTURE.md`; manual staging verification lives in `RAZORPAY_TEST_MODE_CHECKLIST.md`.

### Completed work

- **Schema:** three migrations (`20260728210000_phase7_payments_secure_delivery`, `20260728211500_phase7_rate_limit_attempts`, `20260728212500_phase7_download_grant_raw_token_handoff`) — extends `Payment` (`approvalId`, `reviewLinkId`, `amountSubunits`, `gatewaySignatureVerifiedAt`, `capturedAt`/`failedAt`/`failureCode`, `attemptNumber`, `idempotencyKey`, `metadata`) and adds `WebhookEvent`, `DownloadGrant`/`DownloadGrantFile`/`DownloadLog`, `DeliveryBundle`/`DeliveryBundleJob`, and `RateLimitAttempt`.
- **Payment-gateway abstraction:** `src/payments/{payment-gateway,razorpay-gateway,fake-payment-gateway,payment-config,payment-signatures,payment-amount,payment-errors}.ts` — business logic depends only on the `PaymentGateway` interface; `getPaymentGateway()` (`src/payments/index.ts`) is the single provider-selection point. Production guard (`payment-config.ts`) refuses the fake provider, test-mode keys, a non-live-looking key id, a public/server key mismatch, or a placeholder-looking secret whenever `NODE_ENV=production`.
- **Order creation:** `src/data-access/payment-orders.ts`'s `createPaymentOrder` — re-derives amount/currency/workspace entirely server-side, re-validates the approval snapshot, and is idempotent (reuses an active order; a concurrent-duplicate race resolves via a unique `idempotencyKey`).
- **Checkout verification:** `src/data-access/payment-verification.ts`'s `verifyCheckoutCallback` — verifies against the server-stored order id, never marks a payment `PAID`.
- **Webhook processing:** `src/data-access/webhook-processing.ts` + `POST /api/webhooks/razorpay` — raw-body signature verification before any JSON parsing, event-id deduplication, out-of-order-safe.
- **Central finalization service:** `src/data-access/payment-finalization.ts`'s `finalizeCapturedPayment` — the one function that ever sets `Payment`/`Workspace` to `PAID`, called by both the webhook and reconciliation paths; fully idempotent.
- **Reconciliation:** `src/data-access/payment-reconciliation.ts`'s `reconcilePaymentStatus` — rate-limited, gateway-verified fallback, routed through the same finalization service.
- **Delivery-bundle worker:** `src/worker/{process-deliveries,delivery-job-processor}.ts` (`npm run worker:deliveries` / `worker:deliveries:once`) — atomic job claiming, approval-snapshot re-validation, sanitized/unique/path-traversal-safe ZIP entries (`src/lib/zip-entry-name.ts`), private upload, checksum, one `DownloadGrant` on success. Failure leaves the workspace `PAID` (never re-asks for payment) with a creator-triggered retry action.
- **Secure downloads:** `src/lib/download-token.ts`, `src/data-access/{download-auth,downloads}.ts`, `GET /api/download/[token]/files/[fileId]`, `GET /api/download/[token]/bundle`, `/download/[token]` (`src/app/download/[token]/page.tsx` + `src/components/download/*`) — hash-at-rest, expiring, download-limited, fully independent token space from review tokens.
- **Workflow transitions:** `src/lib/workspace-transitions.ts` extended with `APPROVED -> PAYMENT_PENDING -> PAID -> FILES_UNLOCKED -> DELIVERED`, each gated behind its real precondition (see `PAYMENT_ARCHITECTURE.md`'s state-machine table).
- **Rate limiting:** `src/lib/rate-limit.ts` — minimal PostgreSQL-backed limiter (`RateLimitAttempt`, hashed identifiers, opportunistic per-identifier cleanup), applied to order creation, checkout verification, reconciliation, and both download endpoints.
- **Client UI:** `PaymentPanel` (`src/components/review/payment-panel.tsx`) embedded in the approved review-portal state — covers ready/creating/checkout-open/dismissed/verifying/captured/preparing/preparation-failed/unlocked/failed states, polls the app's own status endpoint (never Razorpay, never `localStorage`); `/download/[token]` hub (`DownloadHub`, `DownloadAllButton`) with individual + bundle downloads, expiry/remaining-count display.
- **Creator UI:** workspace Payment tab (`PaymentStatusCard`) shows real order id, captured/failed/pending state, delivery status, download-grant usage, and offers "Retry" (failed delivery only) and "Refresh Status" (safe reconciliation) actions — never a "mark as paid" control.
- **Activity events:** `PAYMENT_ORDER_CREATED`, `PAYMENT_CHECKOUT_VERIFIED`, `PAYMENT_CHECKOUT_VERIFICATION_FAILED`, `PAYMENT_CAPTURED`, `PAYMENT_FAILED`, `DELIVERY_PREPARATION_STARTED`, `DELIVERY_PREPARATION_FAILED`, `FILES_UNLOCKED`, `FILE_DOWNLOADED`, `BUNDLE_DOWNLOADED`, `DOWNLOAD_GRANT_REVOKED` added to `src/lib/activity-log.ts`'s centralized formatter.
- **Testing:**
  - Unit (Vitest): 12 new test files covering Decimal-to-paise conversion/precision rejection, checkout/webhook signature verification (real HMAC), the fake gateway's own deterministic helpers, production fake-provider/test-key guards, download-token generation/hashing, ZIP entry-name sanitization/de-duplication, the full Phase 7 workspace-transition matrix, rate-limiting (hashed identifiers, per-bucket scoping), webhook deduplication/out-of-order/malformed/invalid-signature routing (mocked Prisma), payment-finalization idempotency/amount/currency-mismatch rejection (mocked Prisma), and download-grant expiry/exhaustion/revocation (mocked Prisma) — 401 unit tests passing in total across the app.
  - Integration (Vitest, real Postgres + real MinIO): `src/data-access/payment-workflow.integration.test.ts` — the full order → checkout-verify → webhook-capture → finalize → delivery-worker → download round trip end to end with real ZIP/checksum/storage, plus duplicate-order reuse, ineligible-workspace rejection, invalid-signature rejection, duplicate/authorized-webhook idempotency, reconciliation-without-webhook, late-webhook-after-reconciliation non-duplication, amount-mismatch/unknown-order rejection, failed-delivery-then-retry, and expired/exhausted download-grant rejection.

### Known differences / deliberate scope boundaries

- **`Payment.amountSubunits`/`Payment.approvalId`/`Payment.reviewLinkId` are non-nullable**, which required updating `prisma/seed.ts`'s pre-Phase-6-era demo `Payment` rows (`pay_101`/`pay_102`/`pay_201`) with matching, minimal, empty-snapshot `ReviewLink`/`WorkspaceApproval` fixtures — these three seeded workspaces predate the real upload/review pipeline and never had real files, so their approvals are decorative, not produced by the real `approveWorkspace` flow. One previously-seeded `CREATED`-status demo payment (`pay_103`, for an `IN_REVIEW` workspace) was removed rather than force-fit, since Phase 7's real order-creation flow would never allow a payment against a non-`APPROVED` workspace.
- **The raw download token has a narrow, documented transient-storage exception** (`DownloadGrant.rawTokenOnce`) to the "hash only" policy other tokens in this app follow strictly — required because email delivery (the normal handoff mechanism) is out of scope this phase. See `SECURE_DOWNLOAD_ARCHITECTURE.md` "Handoff without email" for the full reasoning and the removal path once email delivery ships.
- **The Razorpay gateway implementation uses plain REST calls (`fetch` + HTTP Basic Auth), not the official `razorpay` npm SDK** — keeps the dependency surface smaller; no functional difference to the abstraction any calling code sees.
- **The approved workspace amount is read live from `Workspace.amount` at order-creation time, not frozen onto `WorkspaceApproval`** — `APPROVED`/`PAYMENT_PENDING` are not in `FINANCIAL_LOCK_STATUSES` today (only `PAID`/`FILES_UNLOCKED`/`DELIVERED` are), so a creator could in principle edit the amount between approval and payment. This is a **pre-existing** gap from Phase 4/6, not introduced by this phase, and is called out explicitly in "Remaining risks" below rather than silently left undocumented.
- **`/payments` (the creator's payment ledger list) was not deeply redesigned** — it already displays every `PaymentStatus` value correctly (including the new richer failure/capture states) via the existing `paymentStatusLabel`/`StatusBadge` pattern; the substantially upgraded view is the workspace-level Payment tab (`PaymentStatusCard`), which is where order id/delivery status/retry actually belong.
- **No malware/virus scanning of downloaded originals** — unchanged from Phase 5's documented gap; originals served here are exactly the same objects Phase 5 validated at upload time.
- **Dashboard-level payment metrics were not extended with delivery-specific figures** (e.g. "average time to unlock") — out of scope for this phase; the underlying data (`DeliveryBundle`/`DownloadGrant`/`DownloadLog`) is fully queryable for a future phase to add such a view without further schema change.

### Recommended Phase 8 scope

Following `TECHNICAL_AUDIT.md`'s phased plan, now that the full approve → pay → verify → unlock → download loop is real:

1. **Transactional email** for review-link sharing, payment confirmation, and the secure download link itself (removing the `DownloadGrant.rawTokenOnce` transient-storage exception once email is the real handoff mechanism) — deferred in every phase so far, including this one.
2. **Refunds and tax invoices** — explicitly out of scope for Phase 7; `PaymentStatus.REFUNDED` exists in the schema but no code path sets or handles it yet.
3. **Production deployment** — environment provisioning, the live-mode Razorpay go-live checklist placeholders in `RAZORPAY_TEST_MODE_CHECKLIST.md`, and supervised process management for both workers (`worker:files`, `worker:deliveries`) outside local Docker Compose.
4. Close the pre-existing amount-editability gap noted above (add `APPROVED`/`PAYMENT_PENDING` to a stricter amount-lock, or freeze the approved amount onto `WorkspaceApproval` itself) before this app is used with real money.

Do not begin any of the above until Phase 7 is explicitly reviewed and approved.

## Phase 8 — product simplification (post-Phase-7)

Note: this is a distinct, later initiative from the "Recommended Phase 8 scope" above (which this work does not implement) — naming collision acknowledged; a future doc pass should renumber.

Stakeholder-driven simplification of the creator/client flow, landed as five hand-written forward-only migrations (`prisma/migrations/20260731090000_workspace_client_name_add` through `20260731094000_preview_only_to_approval_only`) plus corresponding application changes:

- **Workspace.clientName** (required `String`) replaces the saved-Client selector as the source of truth for a workspace's client display name. Backfilled from each workspace's related `Client.name`; `Workspace.clientId` is now nullable (`ON DELETE SET NULL`, was `RESTRICT`) and left `null` for every workspace created after this phase. The `Client` model/table is retained for historical joins only — no code path creates a `Client` row anymore.
- **PREVIEW_ONLY delivery mode retired.** The Postgres enum value still exists (dropping an enum value isn't a safe forward-only operation) but `src/validation/workspace.ts`'s `DELIVERY_MODES` only allows `PAYMENT_REQUIRED`/`APPROVAL_ONLY`; a one-time migration converted every existing `PREVIEW_ONLY` workspace to `APPROVAL_ONLY`.
- **Saved-Clients CRM removed** (`/clients*` routes, client cards/tables/forms, the wizard's inline "Add New Client" modal, `src/data-access/clients.ts`, `src/actions/clients.ts` all deleted). The workspace wizard/edit form use a plain "Client Name" textbox instead.
- **Support tickets removed from the app** (`/support*`, `/admin/support*`, all support-ticket UI/actions/DAL deleted). `SupportTicket`/`SupportTicketMessage` tables remain for historical compatibility. A new static "Support" section was added to the Settings page, reading `NEXT_PUBLIC_SUPPORT_EMAIL`/`NEXT_PUBLIC_SUPPORT_PHONE`.
- **Platform fee removed.** `getPlatformFeeBps()` (`src/payments/platform-fee.ts`) always returns 0; every new `PaymentBreakdown` has `platformFeeBps = 0` and `freelancerPayableSubunits = clientChargedSubunits`. Razorpay order-amount and webhook-verification logic are untouched. Payment UI simplified to a single "Amount" instead of separate Gross/Fee/Payout figures.
- **"Preview Client View" added** — a creator-authenticated, ownership-checked, read-only render of the exact client review UI at `/workspaces/[id]/preview`, reusing `ReviewPortal` with a new `readOnlyPreview` prop that disables every mutating action (approve, request changes, comment, pin, annotate, pay, download originals). Preview images are served through a new creator-authenticated `/api/workspaces/[id]/files/[fileId]/preview-url` route, parallel to the token-authorized one.
- Also deleted as unused, unrelated dead code discovered during this pass: `src/data/mock/*`, `src/types/{index,creator,workspace,notification,payment}.ts`, `src/lib/{workspace-progress,payment-metrics,dashboard-metrics}.ts` — a pre-Prisma prototype island with zero live importers.

See `DELIVERY_MODES.md`, `PLATFORM_FEE_AND_PAYOUT_LEDGER.md`, and this repo's PR description for the full requirements this phase implements.
