# Project Vault — Next.js App (Phase 1)

This is the Next.js App Router rewrite of Project Vault, developed side-by-side with the original Vite prototype (which lives at the repository root, one directory up from here, and remains untouched and runnable). This app currently covers **Phase 1 only**: foundation + visual-parity validation for the public/marketing and system-state screens. See `MIGRATION_STATUS.md` for full scope and `VISUAL_PARITY.md` for a screen-by-screen comparison against the original.

## Requirements

- Node.js 20+ (developed against Node 24.6.0)
- npm

## Installation

From this directory (`next-app/`):

```bash
npm install
```

## Development

```bash
npm run dev
```

Runs the app at `http://localhost:3000` by default.

## Build

```bash
npm run build
```

Produces a production build. All routes in this phase are statically prerendered.

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

Runs in TypeScript strict mode with zero suppressions (`strict: true`, no `@ts-ignore`/`@ts-nocheck`/`any`).

## Test

```bash
npm run test
```

Runs the Vitest + React Testing Library suite (jsdom environment). Tests exercise real user-facing behavior (rendered text, roles, `href`s, labelled form fields, toast content) rather than snapshots.

## Route inventory (Phase 1)

| Route | Screen | Notes |
|---|---|---|
| `/` | Landing page | Server Component |
| `/login` | Sign in | Client Component form (visual only, see below) |
| `/register` | Create account | Client Component form (visual only) |
| `/forgot-password` | Reset password | Client Component form (visual only) |
| `/link-expired` | System state — expired secure link | Server Component |
| `/link-revoked` | System state — revoked secure link | Server Component |
| `/permission-denied` | System state — 403 | Server Component |
| `/server-error` | System state — 500 | Server Component |
| *(any unmatched URL)* | `not-found.tsx` | Real Next.js 404 handling (the old app had none) |
| *(uncaught render error)* | `error.tsx` | Next.js route error boundary |

All routes above work when opened directly and after a full browser refresh — there is no client-only route-matching logic (the old app's custom `currentRoute` string-router does not exist in this codebase).

## Current migration scope

This phase proves the approved Stitch design can be reproduced pixel-for-pixel in Next.js App Router + TypeScript strict mode + Tailwind CSS, using:

- A centralized design-token file (`src/app/globals.css`, via Tailwind v4's `@theme`) carrying over every color, radius, shadow, and the Inter typeface from the original `src/index.css`.
- A centralized status-color configuration (`src/lib/status-config.ts`) consumed by `StatusBadge` — no screen redefines status colors locally.
- Shared foundational components: `StatusBadge`, `Toast`, `Button`/`LinkButton`, `PageContainer`, `PublicNav`, `PublicFooter`, `SystemStateLayout`.
- The 8 lowest-risk screens (public marketing + auth UI + system-state pages) migrated to real Next.js routes.

## Explicit list of features NOT yet implemented

Per the Phase 1 boundaries, none of the following exist in this app yet:

- Authentication (login/register/forgot-password are **visual only** — submitting shows a demo toast and does nothing else; no session, no credential storage, no `localStorage`/`sessionStorage`)
- Prisma / any database
- Creator dashboard, workspaces list, workspace details, new-workspace wizard
- Clients, payments, notifications, settings pages
- Admin console
- The secure client review portal (`/review/[token]`)
- File upload, preview generation, or watermarking
- Payments (Razorpay) or any payment simulation
- File unlocking of any kind
- Email (Resend)
- `AppContext` or any equivalent global app state — the old Context-based store was deliberately **not** ported; each interactive component manages its own local state (see `src/hooks/use-toast-message.ts`)

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
- Vite `http://localhost:5173/login` vs. Next.js `http://localhost:3000/login`
- Vite `http://localhost:5173/link-expired` vs. Next.js `http://localhost:3000/link-expired`

`VISUAL_PARITY.md` documents the expected result and any known, disclosed differences for each pair — there should be no undocumented visual difference. No automated screenshot-diffing tool was set up in this phase; comparison was done by manual side-by-side inspection plus line-by-line cross-referencing of every color/spacing/radius value against the original source.
