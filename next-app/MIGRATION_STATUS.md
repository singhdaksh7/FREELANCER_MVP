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
