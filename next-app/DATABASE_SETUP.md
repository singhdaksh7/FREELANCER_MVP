# DATABASE_SETUP.md

Hands-on setup for the PostgreSQL database this app now reads/writes through Prisma. See `AUTH_DATABASE_ARCHITECTURE.md` for the reasoning behind these choices.

## Which routes now use the database

| Route | Reads from |
|---|---|
| `/dashboard` | `src/data-access/dashboard.ts` |
| `/workspaces` | `src/data-access/workspaces.ts` |
| `/clients` | `src/data-access/clients.ts` |
| `/payments` | `src/data-access/payments.ts` |
| `/notifications` | `src/data-access/notifications.ts` |
| `/login`, `/register` | `src/data-access/credentials.ts`, `src/data-access/users.ts` (via Server Actions) |

All other routes (`/`, `/link-expired`, `/link-revoked`, `/permission-denied`, `/server-error`, `/forgot-password`) are unchanged and still static/database-free.

## 1. Local Docker PostgreSQL

```bash
docker compose up -d
```

This starts Postgres 16 (`docker-compose.yml`) on **host port 5433** — not the default 5432, so it doesn't clash with a Postgres instance you might already have running locally. Credentials and database name are set in the compose file (`project_vault` / `project_vault_dev_password` / database `project_vault`) and match the default `.env.example`.

Check it's healthy:

```bash
docker compose ps
# STATUS should read "Up ... (healthy)"
```

Stop it (data persists in a named Docker volume):

```bash
docker compose down
```

## 2. Or: any external `DATABASE_URL`

The app doesn't require Docker — any reachable PostgreSQL instance works. Set `DATABASE_URL` in `.env` to a real connection string (Neon, Supabase, RDS, a colleague's shared dev instance, etc.):

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

## 3. Environment files

```bash
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — already defaults to the Docker setup above.
- `AUTH_SECRET` — generate one: `openssl rand -base64 32`. Never commit a real value; `.env` is gitignored.

`.env`, `.env.test`, and any other `.env*` file are gitignored **except** `.env.example` and `.env.test.example`, which are the committed templates.

## 4. Migrate

```bash
npm run db:generate   # generates the Prisma Client into src/generated/prisma/
npm run db:migrate    # applies prisma/migrations/, creating a new one if the schema changed
```

Prisma 7 does **not** auto-run `generate` or seed after a migration — both are separate, explicit steps (see `AUTH_DATABASE_ARCHITECTURE.md`).

## 5. Seed

```bash
npm run db:seed
```

Deterministic and safe to re-run: each demo account is upserted by email, then that account's clients/workspaces/payments/notifications are deleted and recreated with fixed ids — so re-seeding never produces duplicates, and Arjun's and Meera's data can never bleed into each other.

### Demo credentials

| Creator | Email | Password | Purpose |
|---|---|---|---|
| Arjun Raj | `arjun@example.com` | `Demo@12345` | Primary demo account — 4 clients, 4 workspaces, 3 payments, 7 notifications, preserving the exact content from the approved Phase 1/2 UI |
| Meera Shah | `meera@example.com` | `Demo@12345` | Second account, used to prove creator data isolation (2 clients, 2 workspaces, 1 payment, 2 notifications, entirely distinct records) |

**These are development-only demo credentials with a shared, publicly-documented password.** Never reuse them anywhere real, and never seed them into a production database.

## 6. Reset (⚠️ destructive)

```bash
npm run db:reset
```

This runs `prisma migrate reset`, which **drops all data** and reapplies migrations from scratch. `db:reset` is guarded — `scripts/guard-local-db.mjs` inspects `DATABASE_URL` first and refuses to run unless the host is `localhost`/`127.0.0.1`/`::1`. It will not run against a remote/production database, on purpose. After a reset, reseed with `npm run db:seed`.

## 7. Prisma Studio (visual data browser)

```bash
npm run db:studio
```

Opens a local web UI for browsing/editing the tables in whatever database `DATABASE_URL` currently points at.

## 8. Test database (for integration tests)

Integration tests (`npm run test:integration`) run real Prisma queries against a **separate** database from your dev database, so they can freely delete/recreate rows without touching anything you're manually looking at in Studio.

Set it up once:

```bash
# create a second database inside the same Postgres instance
docker exec project-vault-postgres createdb -U project_vault project_vault_test

# apply the same migrations to it
DATABASE_URL="postgresql://project_vault:project_vault_dev_password@localhost:5433/project_vault_test?schema=public" npx prisma migrate deploy

# create .env.test from the template
cp .env.test.example .env.test
```

Then just run:

```bash
npm run test:integration
```

This automatically re-seeds `project_vault_test` (via `npm run db:seed:test`, itself guarded by `scripts/guard-local-db.mjs --allow-test-suffix`, which additionally requires the database *name* to contain "test") before running the suite in `src/data-access/*.integration.test.ts`. **Never point `TEST_DATABASE_URL` at your development or a production database** — the guard only checks for "looks local and named test," it can't stop you from typing your prod URL into the wrong file.

## Phase 4 schema changes

Migration `prisma/migrations/20260728065323_phase4_client_workspace_mutations` (see `MUTATION_ARCHITECTURE.md` for the full reasoning):

- `Workspace.watermarkText` (nullable `String`) and `Workspace.cancelledAt` (nullable `DateTime`) added.
- `ActivityLog.workspaceId` changed from required to nullable; `ActivityLog.clientId` (nullable, `onDelete: SetNull`) and `ActivityLog.creatorId` (nullable, `onDelete: Cascade`) added, so client-level mutations (not tied to any one workspace) can be logged without a fake `workspaceId`.

If you're pulling this change into an existing local database, run:

```bash
npm run db:generate
npm run db:migrate
```

No seed changes were required — the migration only adds nullable columns, so existing seeded rows remain valid as-is.

## Phase 5 schema changes

Migration `prisma/migrations/20260728085350_phase5_file_storage` (see `FILE_STORAGE_ARCHITECTURE.md` for the full reasoning):

- New enums: `FileKind`, `FileStatus`, `ProcessingJobStatus`, `UploadSessionStatus`.
- New models: `WorkspaceFile`, `FileVersion`, `FileProcessingJob`, `UploadSession`.

Same update path as above (`npm run db:generate && npm run db:migrate`). This phase also requires **object storage**, not just the database — see `FILE_STORAGE_ARCHITECTURE.md` and `FILE_PROCESSING_RUNBOOK.md` for MinIO setup (`docker compose up -d minio minio-init`) and the file-processing worker (`npm run worker:files`), both of which the app now depends on for anything past creating an empty workspace. No seed changes were required here either — no file rows exist in the seed data by design (a creator uploads their own).

## Troubleshooting

- **"password authentication failed" / connection refused** — confirm `docker compose ps` shows the container healthy, and that `DATABASE_URL` in `.env` matches the port (`5433`) and credentials in `docker-compose.yml`.
- **Port 5433 already in use** — change the host-side port mapping in `docker-compose.yml` (`"5433:5432"` → e.g. `"5434:5432"`) and update `DATABASE_URL` to match.
- **`npx prisma generate` complains about a missing output directory** — it creates `src/generated/prisma/` itself; just re-run `npm run db:generate`.
- **Seed fails with a unique-constraint error** — you likely edited seed data ids without re-running `db:reset` first; the delete-then-recreate logic in `prisma/seed.ts` assumes it owns those specific ids.
