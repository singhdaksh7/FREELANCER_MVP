# DEMO_DEPLOYMENT.md — INLAY MVP Demo Deployment

Scope: this document covers **only** the demo-deployment preparation
described here — Render Free Web Service, Neon Postgres, S3-compatible
private storage, Razorpay Test Mode, and a fake payout provider in test
mode. It intentionally excludes general production-hardening work (see
CLAUDE.md — Phase 8 is out of scope).

There is no live payment processing, no live payout/KYC, no custom
domain, and no transactional email in this deployment. Everything is
clearly a demo: seeded test-mode payments, simulated payouts, and a
Render-provided public URL.

## 1. Branding

The public product name is **INLAY**. A centralized config,
`src/lib/branding.ts`, is the single source of truth:

```ts
export const BRAND = {
  productName: process.env.NEXT_PUBLIC_APP_NAME || "INLAY",
  watermarkText: "INLAY PREVIEW",
  supportName: "INLAY Support",
  adminName: "INLAY Administration",
};
```

Every previously-hardcoded "Project Vault" / "PROJECT VAULT" string in a
user-facing screen (landing page, nav, sidebar, mobile header, admin
shell, login, workspace wizard copy, settings, review portal, watermark
text) now reads from `BRAND`. Internal-only identifiers (Prisma
migrations, the `vault-*` Tailwind design tokens, docker-compose/env
identifiers like `project_vault_dev`) were deliberately left alone — they
are plumbing, not user-visible copy, and migrations are never renamed.

The real INLAY logo (a blue 3D wordmark with a distinctive interlocking
"n") lives at `public/branding/logo.png` (transparent background,
full wordmark), `public/branding/logo-source.jpg` (original), and
`public/branding/icon-mark.png` (a cropped standalone icon derived from
the "n" glyph, used as the nav/sidebar icon badge and as the source for
`src/app/icon.png`/`src/app/apple-icon.png`, Next.js's file-convention
favicons).

A regression test, `src/lib/no-old-branding.test.tsx`, renders the public
nav, footer, admin shell, and login screen and asserts none of them ever
contain "Project Vault" again.

## 2. Neon database

- `DATABASE_URL` — pooled connection, used by the app and both workers.
- `DIRECT_URL` — direct connection, used only for `prisma migrate deploy`.
- See NEON_SETUP.md for full setup and the list of commands that must
  never run against a hosted database (`migrate dev`, `db push`, any
  destructive reset).
- `npm run db:seed:demo` runs `prisma/seed-demo.ts`, guarded by
  `scripts/guard-demo-db.mjs` (refuses unless `APP_ENV=demo`). It upserts
  everything by a fixed id — safe to run any number of times, never
  deletes pre-existing data. It seeds:
  - One freelancer account (`freelancer@inlay-demo.app`) and one admin
    account (`admin@inlay-demo.app`), both password `InlayDemo@2026`.
  - Three representative clients.
  - Three workspaces, one per delivery mode: `PAYMENT_REQUIRED` (fully
    paid, with version history, a resolved pin/comment, a payment
    breakdown, payout-ledger data, and a support ticket),
    `APPROVAL_ONLY`, and `PREVIEW_ONLY`.

## 3. Private S3-compatible storage

Unchanged code — the existing `src/storage/` abstraction already reads
exactly `STORAGE_PROVIDER`/`S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_FORCE_PATH_STYLE`, keeps the
bucket private, keeps `temp`/`originals`/`previews`/`deliveries` prefixes
separate, and never exposes raw storage keys or public URLs. See
CLOUD_STORAGE_SETUP.md for bucket setup and the exact CORS policy needed
for browser direct uploads from both `localhost:3000` and the final
Render domain.

## 4. Combined Render demo process

`scripts/start-demo.mjs` supervises three child processes in one Node
process: the Next.js production server (bound to `process.env.PORT` on
`0.0.0.0`), the files worker, and the deliveries worker. It:

- Refuses to start unless `APP_ENV=demo` **and**
  `DEMO_COMBINED_PROCESS=true` — rejected outright in a plain production
  configuration.
- Prefixes every child's log lines (`[web]`, `[files-worker]`,
  `[deliveries-worker]`).
- Forwards `SIGTERM`/`SIGINT` to all children, waits up to 10s for
  graceful exit, then force-kills anything still running.
- Starts each child exactly once — no restart loop. A worker that exits
  unexpectedly is logged loudly (not silently respawned); the web process
  exiting for any reason brings the whole supervisor down (Render's
  health check only watches the web port, so there is no independent
  signal to keep the box alive without a working web server).

`npm run start:demo` runs the supervisor directly (assumes migrations are
already applied). `npm run start:render-demo`
(`scripts/render-demo-entrypoint.mjs`) is what Render actually runs — it
first applies `prisma migrate deploy` (via `DIRECT_URL`), then optionally
seeds (`RUN_DEMO_SEED=true|false`), then hands off to `start-demo.mjs`.

## 5. Demo resource limits

Conservative, explicitly non-final defaults (see `.env.demo.example`):

| Limit | Default |
|---|---|
| Max file size | 10 MB |
| Max files per workspace | 5 |
| Max workspace storage | 40 MB |
| Max image dimension | 4000 px |
| Preview max dimension | 1600 px |
| File-worker concurrency | 1 |
| Delivery-worker concurrency | 1 |
| Max delivery bundle | 40 MB |
| Sharp concurrency | 1 (unset elsewhere) |
| Download grant expiry | 7 days |
| Max downloads per grant | 5 |

These map onto the existing `src/storage/storage-config.ts` limit
getters via new demo-facing env var names (e.g. `MAX_FILE_SIZE_BYTES`)
that take precedence over the original names (`UPLOAD_MAX_FILE_SIZE_BYTES`)
when both are set — so existing deployments/tests that already set the
original names are unaffected.

## 6. Health endpoint

`GET /api/health` reports `{ status, application, database, storage,
demoWorkers }` with `200` when the database and storage config are
reachable/valid, `503` otherwise. It never returns connection strings,
bucket names, endpoints, credentials, or raw Prisma/storage error
messages — every underlying error is logged server-side only.

## 7. Render configuration

See `render.yaml`. Root directory `next-app`, build command
`npm ci && npm run db:generate && npm run build`, start command
`npm run start:render-demo`, health check `/api/health`. No secret values
are committed — they're marked `sync: false` and set manually in the
Render dashboard.

## 8. Razorpay test mode

The existing secure payment flow is unchanged: server-created order,
Checkout-signature verification, captured-payment verification, webhook
validation, and central finalization (`src/data-access/payment-finalization.ts`)
all still run exactly as before. The only addition is a narrow allowance
in `src/payments/payment-config.ts` and `src/payouts/payout-provider.ts`:
when `APP_ENV=demo`, `RAZORPAY_MODE=test` (with the real `razorpay`
provider, never `"fake"`) and `PAYOUT_PROVIDER=fake` are permitted even
though `NODE_ENV=production` — because Render's build requires
`NODE_ENV=production` but this deployment is explicitly demo/test-mode
only. No payment bypass was added; the fake payment gateway is still
forbidden even in demo mode.

## 9. Documentation set

- DEMO_DEPLOYMENT.md (this file)
- RENDER_DEMO_RUNBOOK.md
- NEON_SETUP.md
- CLOUD_STORAGE_SETUP.md
- FOUNDER_DEMO_CHECKLIST.md

## 10. Known demo limitations

- No custom domain — Render-provided `*.onrender.com` URL only.
- No transactional email.
- No live payments, live payouts, or KYC.
- Render's free tier spins down on inactivity — the first request after
  idle can be slow (cold start).
- Resource limits above are demo-tier defaults, not final production
  limits.
