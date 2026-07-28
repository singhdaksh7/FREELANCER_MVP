# Project Vault — Next.js App (Phase 2)

This is the Next.js App Router rewrite of Project Vault, developed side-by-side with the original Vite prototype (which lives at the repository root, one directory up from here, and remains untouched and runnable). This app now covers **Phase 1 + Phase 2**: foundation/visual-parity for the public and system-state screens, plus the creator application shell and five read-only creator screens backed by centralized typed mock data. See `MIGRATION_STATUS.md` for full scope, `VISUAL_PARITY.md` for a screen-by-screen comparison against the original, and `CREATOR_COMPONENT_MAP.md` for the creator-screen component inventory.

## Requirements

- Node.js 20+ (developed against Node 24.6.0)
- npm

## Installation

From this directory (`next-app/`):

```bash
npm install
```

### Playwright browser install (for visual tests only)

The visual regression suite needs a Chromium binary that `npm install` does not download automatically:

```bash
npx playwright install chromium
```

(Only needed once per machine, and only if you plan to run `npm run test:visual`.)

## Development

```bash
npm run dev
```

Runs the app at `http://localhost:3000` by default.

## Build

```bash
npm run build
```

Produces a production build. All routes are statically prerendered.

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

Runs in TypeScript strict mode with zero suppressions (`strict: true`, no `@ts-ignore`/`@ts-nocheck`/`any`). Note: `playwright.config.ts` and `e2e/**` are excluded from this project's `tsconfig.json` (Playwright transpiles its own test files independently and doesn't need them in the Next.js app's type-check scope).

## Test (unit / component)

```bash
npm run test
```

Runs the Vitest + React Testing Library suite (jsdom environment). Tests exercise real user-facing behavior (rendered text, roles, `href`s, labelled form fields, toast content, filtering results) rather than snapshots.

## Visual regression tests

```bash
npm run test:visual
```

Runs the Playwright screenshot-comparison suite (`e2e/visual/*.spec.ts`) against a production build, across 3 viewports (desktop 1440px, tablet 768px, mobile 390px) for each of the 5 creator screens — 15 checks total. The `webServer` block in `playwright.config.ts` builds and starts the app automatically, so you don't need `npm run build`/`start` running separately first.

**Generate the first baseline** (only needed once, or after an intentional visual change):

```bash
npm run test:visual:update
```

This writes/overwrites the PNGs under `e2e/visual/*.spec.ts-snapshots/` and always passes (there's nothing to compare against yet, or you're deliberately accepting new output).

**Run comparisons** (the normal, everyday command — what CI would run):

```bash
npm run test:visual
```

Compares each fresh screenshot against the committed baseline and fails if they differ by more than 1% of pixels (`maxDiffPixelRatio: 0.01` in `playwright.config.ts`, to absorb harmless anti-aliasing drift between machines).

**Review changes:** on a failing run, Playwright writes an HTML report (`playwright-report/index.html`, open it in a browser) showing expected/actual/diff images side-by-side for every failing check, plus a `test-results/` folder with the same data.

**Update baselines intentionally:** after confirming a diff is an *intended* visual change (not a regression), re-run `npm run test:visual:update` to accept the new screenshots, then commit the updated PNGs alongside the code change that caused them.

Determinism notes (see `MIGRATION_STATUS.md` → "Visual-test status" for the full list): remote avatar images are intercepted and replaced with a static placeholder so screenshots never depend on network access; all content comes from static mock data; animations are disabled during capture; date-range filtering uses a fixed reference date instead of the system clock.

## Route inventory

### Public / system-state (Phase 1)

| Route | Screen | Notes |
|---|---|---|
| `/` | Landing page | Server Component |
| `/login` | Sign in | Client Component form (visual only) |
| `/register` | Create account | Client Component form (visual only) |
| `/forgot-password` | Reset password | Client Component form (visual only) |
| `/link-expired` | System state — expired secure link | Server Component |
| `/link-revoked` | System state — revoked secure link | Server Component |
| `/permission-denied` | System state — 403 | Server Component |
| `/server-error` | System state — 500 | Server Component |
| *(any unmatched URL)* | `not-found.tsx` | Real Next.js 404 handling |
| *(uncaught render error)* | `error.tsx` | Next.js route error boundary |

### Creator (Phase 2)

| Route | Screen | Notes |
|---|---|---|
| `/dashboard` | Creator dashboard | Server Component |
| `/workspaces` | Workspaces directory | Server page + Client search/filter |
| `/clients` | Clients directory | Client Component |
| `/payments` | Payments & revenue ledger | Server page + Client filters |
| `/notifications` | Notifications feed | Server page + Client read/unread toggle |

All routes above work when opened directly and after a full browser refresh — there is no client-only route-matching logic (the old app's custom `currentRoute` string-router does not exist in this codebase). The five creator routes live under a `(creator)` **route group** (`src/app/(creator)/`) purely for file organization; route groups never add a URL segment, so there is no `/creator` prefix.

## Current migration scope

- **Design system:** a centralized design-token file (`src/app/globals.css`, via Tailwind v4's `@theme`) carries over every color, radius, shadow, breakpoint, and the Inter typeface from the original `src/index.css`, plus layout-dimension tokens for the 240px sidebar / 64px header / 60px mobile nav.
- **Status colors:** centralized in `src/lib/status-config.ts`, consumed by `StatusBadge` everywhere — no screen redefines status colors locally.
- **Mock data:** fully typed (`src/types/*`) and centralized (`src/data/mock/*`), replacing `AppContext.jsx`/`mockData.js` for the screens migrated so far. No global mutable store — Client Components hold only their own local UI state.
- **13 screens migrated:** the 8 public/system-state screens from Phase 1, plus Dashboard, Workspaces, Clients, Payments, and Notifications from Phase 2.
- **Shared component library:** see `CREATOR_COMPONENT_MAP.md` for the creator-specific inventory, and Phase 1's primitives (`StatusBadge`, `Toast`, `Button`/`LinkButton`, `PageContainer`) reused throughout.

## Explicit list of features NOT yet implemented

- Authentication (login/register/forgot-password are **visual only**; no session, no credential storage, no `localStorage`/`sessionStorage`)
- Prisma / any database — everything is typed, in-memory mock data
- Workspace detail page (`/workspaces/[id]`), new-workspace wizard (`/workspaces/new`)
- Settings page (`/settings`) — the nav link exists and is visually consistent, but the route is unbuilt
- Admin console (`/admin/*`)
- The secure client review portal (`/review/[token]`)
- File upload, preview generation, or watermarking
- Payments (Razorpay) or any payment simulation
- File unlocking of any kind
- Email (Resend)
- Any create/edit/delete mutation — Add/Edit/Delete Client, workspace creation, payment receipts, and "mark all notifications read" are all either disabled with an accessible explanation or show an "available in a later phase" toast; nothing is ever faked as saved or deleted
- `AppContext` or any equivalent global app state

## Current limitations

- The Playwright visual suite covers default page loads only — not the mobile drawer's open state, hover/focus states, or empty/no-results states (all reachable only through interaction). See `MIGRATION_STATUS.md` → "Visual-test status."
- Visual baselines were generated and are only verified on this Windows/Chromium environment; a different OS/font-rendering stack could show minor anti-aliasing differences (the 1% pixel-diff tolerance is meant to absorb exactly this).
- `npm audit` reports pre-existing high-severity advisories inherited from `create-next-app`'s default dependency tree — unrelated to any code written in these phases, not addressed per the "don't install unrelated dependencies" boundary.

## How to compare with the original Vite application

The original app is untouched at the repository root and can be run independently:

```bash
# from the repository root, in a separate terminal
npm run dev
# Vite dev server, default http://localhost:5173
```

```bash
# from next-app/, in another terminal
npm run dev
# Next.js dev server, default http://localhost:3000
```

With both running, open the same screen side-by-side, e.g.:

- Vite `http://localhost:5173/` (landing) vs. Next.js `http://localhost:3000/`
- Vite `http://localhost:5173/dashboard` vs. Next.js `http://localhost:3000/dashboard`
- Vite `http://localhost:5173/workspaces` vs. Next.js `http://localhost:3000/workspaces`

`VISUAL_PARITY.md` documents the expected result and any known, disclosed differences for each pair — there should be no undocumented visual difference. Manual side-by-side inspection and line-by-line cross-referencing of color/spacing/radius values were used for both phases; Phase 2 additionally has the automated Playwright screenshot suite described above.
