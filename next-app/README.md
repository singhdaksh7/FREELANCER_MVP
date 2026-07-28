# Project Vault — Next.js App (Phase 3)

This is the Next.js App Router rewrite of Project Vault, developed side-by-side with the original Vite prototype (which lives at the repository root, one directory up from here, and remains untouched and runnable). This app now covers **Phase 1 + 2 + 3**: foundation/visual-parity for public screens, the creator shell + read-only creator screens, and — new in Phase 3 — real PostgreSQL persistence via Prisma and real creator authentication via Auth.js. See `MIGRATION_STATUS.md` for full scope, `AUTH_DATABASE_ARCHITECTURE.md` for the auth/database architecture, `DATABASE_SETUP.md` for hands-on database setup, `VISUAL_PARITY.md` for a screen-by-screen comparison against the original, and `CREATOR_COMPONENT_MAP.md` for the creator-screen component inventory.

## Requirements

- Node.js 20+ (developed against Node 24.6.0)
- npm
- Docker (for the local Postgres database) — or any reachable external PostgreSQL instance

## Installation

From this directory (`next-app/`):

```bash
npm install
```

### Database (required before running the app)

See `DATABASE_SETUP.md` for full detail. Quick path:

```bash
docker compose up -d              # starts local Postgres on port 5433
cp .env.example .env              # fill in AUTH_SECRET (openssl rand -base64 32)
npm run db:generate
npm run db:migrate
npm run db:seed
```

Demo login after seeding: `arjun@example.com` / `Demo@12345` (see `DATABASE_SETUP.md` for the second demo account and full credential list).

### Playwright browser install (for visual/E2E tests only)

```bash
npx playwright install chromium
```

(Only needed once per machine, and only if you plan to run `npm run test:visual`.)

## Development

```bash
npm run dev
```

Runs the app at `http://localhost:3000` by default. Requires the database to be running and migrated (see above) — every creator route now reads from Postgres.

## Build

```bash
npm run build
```

Produces a production build. Public/system-state pages remain statically prerendered; every creator route and the auth API route are server-rendered on demand (they depend on the authenticated session and live data).

```bash
npm run start
```

Serves the production build.

## Lint

```bash
npm run lint
```

Runs ESLint (`eslint-config-next`).

## Type-check

```bash
npx tsc --noEmit
```

Runs in TypeScript strict mode with zero suppressions (`strict: true`, no `@ts-ignore`/`@ts-nocheck`/`any`). Note: `playwright.config.ts` and `e2e/**` are excluded from this project's `tsconfig.json` (Playwright transpiles its own test files independently).

## Test (unit / component)

```bash
npm run test
```

Runs the Vitest + React Testing Library suite (jsdom environment, mocked Prisma/Auth.js — never touches a real database). Tests exercise real user-facing behavior and real logic (validation schemas, decimal-safe money math, query-scoping assertions, auth-redirect behavior) rather than snapshots.

## Test (database integration)

```bash
npm run test:integration
```

Runs `src/data-access/**/*.integration.test.ts` against a **dedicated test database** (never your dev database) — real Prisma queries, real bcrypt hashing, real seeded two-creator isolation checks. Automatically reseeds that database first. See `DATABASE_SETUP.md` → "Test database" for one-time setup, and `scripts/guard-local-db.mjs`, which refuses to run against anything that isn't a local database with "test" in its name.

## Visual regression + authentication E2E tests

```bash
npm run test:visual
```

Runs the full Playwright suite (`e2e/**/*.spec.ts`) against a production build talking to your **real, seeded development database** — there is no mocking at this layer. Two kinds of coverage:

- **`e2e/auth/*.spec.ts`** — functional tests of the real login/logout/redirect flow (unauthenticated redirect, valid/invalid login, logout, session-survives-refresh, authenticated identity display). Run serially against the shared dev server (see the comment in `auth-flow.spec.ts` for why).
- **`e2e/visual/*.spec.ts`** — screenshot comparisons across 3 viewports (desktop 1440px, tablet 768px, mobile 390px): the 5 creator screens, the login validation-error state, the mobile navigation drawer open state, and a workspaces empty/no-results state. A `setup` project logs in once as the seeded demo creator and reuses that session (`e2e/visual/.auth/creator.json`, gitignored) across the screenshot tests; `login-validation.spec.ts` explicitly overrides that with a fresh logged-out context, since it's testing the public login page.

The `webServer` block in `playwright.config.ts` builds and starts the app automatically, so you don't need `npm run build`/`start` running separately first — but the **database must already be migrated and seeded** (see above), since the app now depends on it to render anything past the login page.

**Generate the first baseline** (only needed once, or after an intentional visual change):

```bash
npm run test:visual:update
```

**Review changes:** on a failing run, open the generated `playwright-report/index.html` for side-by-side expected/actual/diff images.

**Update baselines intentionally:** after confirming a diff is an *intended* visual change, re-run `npm run test:visual:update` and commit the updated PNGs alongside the code change that caused them.

Determinism notes (see `MIGRATION_STATUS.md` → "Visual-test status" for the full list): remote avatar images are intercepted and replaced with a static placeholder; animations are disabled during capture; payment date-range filtering uses a fixed reference date instead of the system clock; the seed data itself is deterministic (fixed ids, fixed timestamps).

## Route inventory

### Public / system-state (Phase 1)

| Route | Screen | Notes |
|---|---|---|
| `/` | Landing page | Server Component, public |
| `/login` | Sign in | Real credentials login (Server Action) |
| `/register` | Create account | Real registration (Server Action) |
| `/forgot-password` | Reset password | States plainly that recovery isn't enabled yet — no email is sent |
| `/link-expired` | System state — expired secure link | Server Component |
| `/link-revoked` | System state — revoked secure link | Server Component |
| `/permission-denied` | System state — 403 | Also used for an authenticated non-CREATOR role |
| `/server-error` | System state — 500 | Server Component |
| *(any unmatched URL)* | `not-found.tsx` | Real Next.js 404 handling |
| *(uncaught render error)* | `error.tsx` | Next.js route error boundary |

### Creator (Phase 2 UI, Phase 3 data + auth) — all protected

| Route | Screen | Notes |
|---|---|---|
| `/dashboard` | Creator dashboard | Database-backed, scoped to the authenticated creator |
| `/workspaces` | Workspaces directory | Database-backed search/status/client filter/sort via URL params |
| `/clients` | Clients directory | Database-backed search, derived active-workspace/outstanding figures |
| `/payments` | Payments & revenue ledger | Database-backed status/date filters, Decimal-safe totals |
| `/notifications` | Notifications feed | Database-backed list |

All creator routes redirect unauthenticated visitors to `/login` (`src/proxy.ts`, backed by a definitive re-check in `src/app/(creator)/layout.tsx` and every data-access function — see `AUTH_DATABASE_ARCHITECTURE.md`). They live under a `(creator)` **route group** purely for file organization; route groups never add a URL segment, so there is still no `/creator` prefix.

## Current migration scope

- **Auth:** real registration + credentials login + logout via Auth.js (JWT sessions, no adapter) — see `AUTH_DATABASE_ARCHITECTURE.md`.
- **Database:** PostgreSQL via Prisma 7 (driver-adapter model), schema in `prisma/schema.prisma`, deterministic seed in `prisma/seed.ts`.
- **Data access:** `src/data-access/*` — every creator-scoped query derives `creatorId` from the authenticated session, never from a parameter.
- **Design system, status colors, shared components:** unchanged from Phase 1/2 — see `CREATOR_COMPONENT_MAP.md` and `VISUAL_PARITY.md`.

## Explicit list of features NOT yet implemented

- Workspace detail page (`/workspaces/[id]`), new-workspace wizard (`/workspaces/new`)
- Workspace/client creation, editing, deletion (Add/Edit/Delete are visible but show a deferred-action toast or are disabled — never a fake success)
- Settings page (`/settings`) — the nav link exists and is visually consistent, but the route is unbuilt
- Admin console (`/admin/*`)
- The secure client review portal (`/review/[token]`)
- File upload, object storage, preview generation, watermarking
- Payments (Razorpay), payment webhooks, file unlocking, download grants
- Email delivery (Resend) — password reset and email verification are explicitly non-functional (see `/forgot-password` and `AUTH_DATABASE_ARCHITECTURE.md`'s deferred-security list)
- Notification mutations (mark-as-read is local-only prototype state, not persisted)
- Rate limiting, MFA, OAuth login, production secret rotation

## Current limitations

- Auth security hardening (email verification, password reset, rate limiting, MFA) is explicitly deferred — see `AUTH_DATABASE_ARCHITECTURE.md`'s security section. Do not treat this phase as production-hardened auth.
- Visual baselines were generated and are only verified on this Windows/Chromium environment; a different OS/font-rendering stack could show minor anti-aliasing differences (the 1% pixel-diff tolerance absorbs this).
- `npm audit` reports pre-existing high-severity advisories inherited from `create-next-app`'s default dependency tree — unrelated to code written in these phases.
- `src/data/mock/*` and `src/types/*` (the Phase 2 mock data and types) are now obsolete for production routes — kept only for reference/legacy tests. See `MIGRATION_STATUS.md` for the exact list.

## How to compare with the original Vite application

The original app is untouched at the repository root and can be run independently:

```bash
# from the repository root, in a separate terminal
npm run dev
# Vite dev server, default http://localhost:5173
```

```bash
# from next-app/, in another terminal (database must be running/seeded first)
npm run dev
# Next.js dev server, default http://localhost:3000
```

The Vite app has no real login, so its creator screens are reachable directly; the Next.js app requires signing in first (`arjun@example.com` / `Demo@12345`) before `/dashboard` etc. render. `VISUAL_PARITY.md` documents the expected result and any known, disclosed differences.
