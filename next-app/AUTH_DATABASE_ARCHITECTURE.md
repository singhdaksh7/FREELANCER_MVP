# AUTH_DATABASE_ARCHITECTURE.md

Architecture decisions for Phase 3 (PostgreSQL, Prisma, creator authentication, database-backed read-only screens). See `DATABASE_SETUP.md` for hands-on setup/commands and `MIGRATION_STATUS.md` for scope and what's still deferred.

## Versions this was built against

Checked before writing any code (per the phase brief's "Version and Documentation Check"):

| Package | Version | Notes |
|---|---|---|
| Next.js | 16.2.12 | `middleware.ts` is deprecated/renamed to `proxy.ts`; Proxy now defaults to the **Node.js runtime** (not Edge) |
| React | 19.2.4 | `useActionState` used for the login/register forms |
| next-auth (Auth.js) | 5.0.0-beta.32 | Its `peerDependencies` explicitly declare `next: "^14.0.0-0 \|\| ^15.0.0 \|\| ^16.0.0"` and `react: "^18.2.0 \|\| ^19.0.0"` — confirmed compatible before installing |
| Prisma | 7.9.1 | Major-version jump from the more commonly-documented Prisma 5/6: new `prisma-client` generator (not `prisma-client-js`), mandatory `output` path, `prisma.config.ts` instead of `datasource.url` in the schema, driver adapters required (`@prisma/adapter-pg`), no auto-generate/auto-seed after `migrate dev`/`migrate reset` |

Given how new all of this is, `node_modules/next/dist/docs/` (bundled with the installed Next.js version) and the Prisma upgrade-guide skill files that `prisma init` installs under `.agents/skills/prisma-upgrade-v7/` were read directly rather than relying on prior training-data assumptions about either tool. No Next.js or React upgrade was needed or performed.

## Why `proxy.ts`, not `middleware.ts`

Next.js 16 renamed the middleware file convention to `proxy.ts` (same mechanism, new name — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, "Middleware is deprecated and has been renamed to Proxy"). `src/proxy.ts` exports a default function; `src/middleware.ts` does not exist in this project.

## Auth.js session strategy: JWT, Credentials provider, no adapter

**Chosen:** `session: { strategy: "jwt" }`, a single `Credentials` provider, **no database adapter**.

**Why:**

1. **Credentials + database sessions don't mix in Auth.js.** Auth.js's "database" session strategy is designed around its own adapter-managed `Session`/`Account` tables and is not supported in combination with the Credentials provider (Auth.js persists a server-side session record on sign-in via the adapter, which assumes an OAuth-style provider flow). JWT sessions are the standard, supported approach for credentials-based auth.
2. **No adapter needed for the schema this phase requires.** With an adapter you get Auth.js-managed `User`/`Account`/`Session`/`VerificationToken` tables. This project already needed its own `User` model (with `passwordHash`, `role`, etc. — fields Auth.js's own `User` model doesn't have) and full control over registration (Zod validation, bcrypt hashing, duplicate-email handling), so an adapter would have meant reconciling two competing `User` models. Skipping the adapter keeps exactly one `User` table, owned entirely by this app's Prisma schema — which is also why the schema has **no** `Account`/`Session`/`VerificationToken` tables (per the brief: "Auth.js-specific models should only be added when required by the selected and documented session strategy" — this strategy doesn't require them).
3. **The session JWT carries only `id` and `role`** (`src/auth.ts`'s `jwt`/`session` callbacks) — never `passwordHash`, never anything beyond the minimum needed to look the user back up. Every actual read of creator data re-fetches the user row from Postgres (`getAuthenticatedCreator` in `src/data-access/auth.ts`) rather than trusting the JWT's claims for anything beyond identity.
4. **Credential verification is isolated from the Auth.js config itself.** `src/data-access/credentials.ts` exports `verifyCredentials(email, password)`, called from `authorize()` in `src/auth.ts`. This keeps the actual "look up the user, check the password" logic testable on its own (see `src/data-access/isolation.integration.test.ts`) without needing to import the full `next-auth` package (whose `AuthError` export pulls in `next/server`, which isn't resolvable under Vitest's plain Node module resolution — a real friction point documented below).

## Prisma client setup

`src/lib/prisma.ts` is a singleton, built the way Prisma 7's driver-adapter model requires:

```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
```

- **Driver adapter, not a bundled engine binary.** Prisma 7 removed the Rust query-engine binary from the default `prisma-client` generator path; a `@prisma/adapter-pg` (wrapping the `pg` driver) is required for Postgres. This is a hard requirement of the Prisma version installed, not a style choice.
- **Cached on `globalThis` outside production**, the standard fix for Next.js dev-mode hot-reloading otherwise creating a new `PrismaClient` (and a new connection pool) on every file save, eventually exhausting Postgres's connection limit.
- **Generated client lives at `src/generated/prisma/`** (gitignored), not `node_modules/@prisma/client` — Prisma 7's `prisma-client` generator requires an explicit `output` path (see `prisma/schema.prisma`). Run `npm run db:generate` after any schema change; Prisma 7 no longer auto-regenerates after `migrate dev`.
- **Two import entrypoints are used deliberately:** `@/generated/prisma/client` (the full server-side client, Node-only — used only from `server-only`-marked modules) and `@/generated/prisma/enums` / `@/generated/prisma/browser` (dependency-free, browser-safe — used from Client Components like the filter bars, so enum values for filter dropdowns never accidentally pull Prisma's Node runtime into a client bundle).

## Route-protection approach: two independent layers

Per the brief's explicit requirement, protection is **not** a single check:

1. **Optimistic layer — `src/proxy.ts`.** Wraps the Auth.js `auth()` helper, which decodes/verifies the JWT session cookie only — it never queries Postgres. Redirects unauthenticated requests to `/dashboard`, `/workspaces`, `/clients`, `/payments`, `/notifications` (and their sub-paths) to `/login`, and redirects already-authenticated visitors away from `/login`/`/register` to `/dashboard`. Runs on (almost) every request, so it must stay cheap — no database access, per the brief.
2. **Definitive layer — `src/app/(creator)/layout.tsx` + every data-access function.** The creator route group's layout calls `requireCreatorRole()` (`src/data-access/auth.ts`), which re-verifies the session **and re-reads the user row from Postgres** (never trusting the JWT's claims alone), redirecting to `/login` (no session) or `/permission-denied` (wrong role) if it fails. Independently of the layout, every read in `src/data-access/{dashboard,workspaces,clients,payments,notifications}.ts` calls `requireAuthenticatedUser()` itself and derives `creatorId` from that — so even if a future code change ever bypassed the layout (a new route, a Server Action, a route handler), the query itself still can't run unscoped.

This matches the Next.js team's own documented guidance (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Authorization" section): Proxy/Middleware is for optimistic checks only; the Data Access Layer is where enforcement actually has to live, because Proxy doesn't run in every code path that touches data (Server Actions, direct data-access calls from a script, etc.).

## Data-access authorization approach

- **Every creator-scoped query derives `creatorId` from `requireAuthenticatedUser()`**, never from a function parameter, URL search param, or form field. `src/data-access/scoping.test.ts` unit-tests this directly (mocking Prisma, asserting the `where` clause) and `src/data-access/isolation.integration.test.ts` proves it against the real seeded two-creator database (Arjun cannot see Meera's clients/workspaces/dashboard figures, and vice versa).
- **`passwordHash` is only ever selected inside `verifyCredentials()`** (`src/data-access/credentials.ts`) — no other query anywhere selects it, and `getAuthenticatedCreator()`'s Prisma `select` explicitly lists safe fields only (`id, name, email, role, image`).
- **One small data-access module per concern** (`auth.ts`, `credentials.ts`, `users.ts`, `dashboard.ts`, `workspaces.ts`, `clients.ts`, `payments.ts`, `notifications.ts`) rather than one large service file, so each file's Prisma queries and their authorization logic stay easy to audit together.
- **Money is never floating-point.** `amount`/`feeAmount` are Prisma `Decimal` columns; `src/lib/decimal.ts` provides `sumDecimals`/`toDecimal` (which stay in Decimal-space for every intermediate calculation) and `toDisplayNumber` (a single, final conversion to `number`, only at the point of handing a value to `Intl.NumberFormat`). See `src/lib/decimal.test.ts` for the canonical `0.1 + 0.2` float-drift regression test.

## A real friction point worth documenting: `server-only` under Vitest

`src/lib/prisma.ts`, `src/lib/password.ts`, and every `src/data-access/*.ts` module import the `server-only` package. Next.js's bundler specially intercepts this import (no-op inside Server Component code, hard error only if it ends up in a client bundle). Plain Node — which is what Vitest runs under — has no such interception: the real `server-only` package unconditionally throws on any import. `vitest.setup.ts` and `vitest.integration.setup.ts` both mock it out (`vi.mock("server-only", () => ({}))`), which is the standard, widely-used workaround for unit-testing "server-only" code with Vitest. Worth knowing if this surprises anyone touching the test suite later.

## Local database setup

See `DATABASE_SETUP.md` for full instructions. Summary: `docker-compose.yml` runs Postgres 16 on host port **5433** (not 5432, to avoid clashing with any Postgres already running locally), with a dedicated second database (`project_vault_test`) for integration tests so they never touch development data.

## Production database considerations

Not implemented in this phase (no production deployment exists yet), but worth recording as forward guidance:

- **Any standard PostgreSQL `DATABASE_URL` works** — the driver-adapter model (`@prisma/adapter-pg`) doesn't assume Docker or localhost; a hosted instance (Neon, Supabase, RDS, etc.) just needs its connection string in `DATABASE_URL` (with `sslmode=require` where applicable).
- **`AUTH_SECRET` must be a real, rotated secret in production**, generated independently of the development one committed nowhere (`.env` is gitignored; only `.env.example` is committed, with a placeholder).
- **`AUTH_URL`/`trustHost` reconsideration for production:** this phase relies on `trustHost: true` (see `src/auth.ts`) so Auth.js derives the canonical URL from the incoming request's `Host` header — convenient for local dev and for Playwright's test server (which runs on a different port than `next dev`), since it avoids editing `.env` to match. Behind an untrusted reverse proxy in production, `trustHost` should be revisited (or the proxy configured to only forward a verified `Host` header) and a fixed `AUTH_URL` set explicitly.
- **Connection pooling:** `@prisma/adapter-pg` uses `pg`'s own pool defaults. A serverless/edge deployment target would need a pooler (e.g., PgBouncer, or a serverless-aware adapter like `@prisma/adapter-neon`) — out of scope for this phase, which targets a long-lived Node.js server process.
- **Migrations in production** should run via `prisma migrate deploy` (already wired as `npm run db:migrate:deploy`), never `migrate dev` (which can create new migrations interactively) or `migrate reset` (destructive).

## Security section

### Enforced in this phase

- Creator ownership scoped at the data-access layer on every query (not just the route boundary) — see "Data-access authorization approach" above.
- Generic `"Invalid email or password."` message for every login failure — never reveals whether an email exists (`src/actions/auth.ts`).
- Passwords hashed with bcrypt (`bcryptjs`, cost factor 12) — `src/lib/password.ts`. Raw passwords are never logged (checked: no `console.log` of `password`/`rawCredentials` anywhere) and never stored.
- Server-side Zod validation for both registration and login (`src/lib/validation/auth.ts`) — client-side HTML5 `required`/`type="email"` attributes are a UX nicety, not the actual validation boundary.
- Email normalization (trim + lowercase) applied identically on every write and read (`src/lib/normalize-email.ts`), so `Arjun@Example.com` and `arjun@example.com` are always the same account.
- Duplicate-account prevention: an in-transaction check plus the schema's `@unique` constraint on `email` as the race-safe backstop (`src/data-access/users.ts`).
- `passwordHash` never leaves the database layer except into `bcrypt.compare()` — no query anywhere else selects it, and no API/page ever serializes a `User` object without an explicit safe `select`.
- No `creatorId` (or any identity) ever accepted from a client-provided source (query params, form fields, headers) — always derived from the verified session.
- No Prisma import in any Client Component — `@/lib/prisma` and every `@/data-access/*` module are `server-only`; Client Components (the filter bars) only import type-only Prisma re-exports or the dependency-free `enums`/`browser` entrypoints.
- No `AUTH_SECRET` (or any secret) in a `NEXT_PUBLIC_*` variable.
- No `localStorage`/`sessionStorage`-based authentication anywhere — the session lives entirely in an `HttpOnly` cookie managed by Auth.js.
- No raw Prisma/SQL errors shown to users: the creator route group's `error.tsx` renders a generic "Something went wrong" message and only `console.error`s the real error (see `src/app/(creator)/error.tsx`); registration/login failures are caught and mapped to the two generic messages above before ever reaching the UI.

### Explicitly deferred (do not assume these are handled)

- **Email verification** — accounts are usable immediately after registration; `emailVerified` exists on the `User` model but nothing sets it.
- **Password reset / email delivery** — `/forgot-password` explicitly states recovery isn't enabled yet (see `src/components/auth/forgot-password-notice.tsx`); no email is ever sent.
- **Brute-force / rate-limiting infrastructure** — login and registration have no attempt throttling, no CAPTCHA, no lockout. A production deployment needs this before it's exposed publicly.
- **Multi-factor authentication** — not implemented.
- **OAuth login** — only the Credentials provider is configured.
- **Production secret rotation / secret-management infrastructure** — `.env` holds a single static, dev-only `AUTH_SECRET`; nothing here manages rotation, versioning, or a secrets manager.

None of the above should be read as "hardened" by anything in this phase — they remain open work for a future phase focused specifically on production auth hardening.
