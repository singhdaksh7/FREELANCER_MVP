# Neon Database Setup — INLAY Demo Deployment

The demo deployment uses [Neon](https://neon.tech) Postgres instead of the
local Docker Postgres used for development (`docker-compose.yml`). The
Prisma schema and application code are unchanged — only connection
configuration differs.

## 1. Create a dedicated demo project/branch

Create a **separate** Neon project (or at minimum a separate branch) for
the demo — never point the demo deployment at a database that also holds
real user data. Name it something unambiguous, e.g. `inlay-demo`.

## 2. Two connection strings

Neon exposes both a pooled (PgBouncer) and a direct connection string.
This app now uses both, for different purposes:

- **`DATABASE_URL`** — the pooled connection string. Used by the running
  application (`src/lib/prisma.ts`) and both background workers
  (`src/worker/process-files.ts`, `src/worker/process-deliveries.ts`) for
  all normal request/job traffic.
- **`DIRECT_URL`** — the direct (non-pooled) connection string. Used only
  for `prisma migrate deploy` (see `scripts/render-demo-entrypoint.mjs`),
  since schema migrations behave more predictably over a direct connection
  than through a transaction pooler. Falls back to `DATABASE_URL` if
  `DIRECT_URL` isn't set (e.g. local smoke-testing without a real Neon
  branch).

Copy both from the Neon dashboard's "Connection Details" panel (toggle
"Pooled connection" on/off to get each variant) and set them in Render's
environment-variable dashboard for the demo service.

## 3. Deployment commands — what to use, what never to use

`start:render-demo` (via `scripts/render-demo-entrypoint.mjs`) runs, in
order:

1. `prisma migrate deploy` — applies committed migrations only. Never
   generates new migrations, never drops/resets data.
2. The idempotent demo seed (`npm run db:seed:demo`), only when
   `RUN_DEMO_SEED=true` — safe to leave on for every deploy, since
   `prisma/seed-demo.ts` only ever upserts by fixed ids and never deletes
   anything.
3. The combined-process supervisor (`scripts/start-demo.mjs`).

**Never run against the Neon demo database** (or any hosted database):

- `prisma migrate dev` — generates new migrations interactively and can
  drop/recreate the shadow database; a dev-only command.
- `prisma db push` — bypasses the migration history entirely.
- Any destructive reset (`npm run db:reset`, `prisma migrate reset`) —
  these are guarded locally by `scripts/guard-local-db.mjs`, which already
  refuses to run against anything but `localhost`/`127.0.0.1`/`::1`, so
  they cannot target Neon by construction.
- The local/test seed (`prisma/seed.ts` / `npm run db:seed`,
  `npm run db:seed:test`) — these are for local development and the
  Playwright/integration test suites only. The demo uses the separate
  `prisma/seed-demo.ts` (`npm run db:seed:demo`), which is itself guarded
  by `scripts/guard-demo-db.mjs` to refuse running unless `APP_ENV=demo`.

## 4. Connection limits

Neon's free tier has a limited pooled-connection ceiling. This app's
combined demo process runs three Postgres clients in one instance (the
Next.js app, the files worker, the deliveries worker), each with its own
small connection pool — comfortably within Neon's free-tier limits at
demo scale (default worker concurrency of 1 each, per DEMO_DEPLOYMENT.md's
resource limits). If you raise `FILE_WORKER_CONCURRENCY` /
`DELIVERY_WORKER_CONCURRENCY` beyond 1, re-check Neon's connection limit
for your plan.

## 5. Verifying the connection

After setting `DATABASE_URL`/`DIRECT_URL` and deploying, `/api/health`
reports `"database": "reachable"` on success (see the health-endpoint
section of DEMO_DEPLOYMENT.md) without ever exposing the connection
string itself in the response.
