/**
 * Resolves and validates the single database URL every process Playwright
 * spawns for an E2E run must share — the Next.js web server, the
 * file-processing worker, and the delivery worker (see playwright.config.ts).
 *
 * Confirmed root cause of a prior review-e2e failure: each `webServer`
 * entry is a fresh child process that loads its own `.env` via dotenv, so
 * without an explicit override each one independently resolved
 * `DATABASE_URL` from `.env` — the normal development database — even
 * though the shell that launched Playwright had an isolated
 * `DATABASE_URL` exported. Records ended up written to `project_vault`
 * instead of `project_vault_e2e`. Centralizing "which database" as one
 * value, computed once and explicitly injected into every child's `env`,
 * removes the chance of a child silently falling back to its own dotenv
 * resolution.
 */

export interface ResolvedE2EDatabase {
  /** The full connection string — never logged; may contain credentials. */
  url: string;
  /** Just the database name, safe to print. */
  databaseName: string;
}

export class E2EDatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "E2EDatabaseConfigError";
  }
}

/** Database names accepted as "looks isolated" — never the normal dev database. */
const ISOLATED_SUFFIXES = ["_e2e", "_test"];

/**
 * Picks the database URL for this E2E run — `E2E_DATABASE_URL` if set,
 * falling back to `DATABASE_URL` — and refuses to proceed unless it's a
 * valid URL whose database name looks like a dedicated isolated database.
 * Throws `E2EDatabaseConfigError` (never prints the raw URL) on any
 * failure; the caller decides how to surface that (see
 * playwright.config.ts, which fails the whole config load).
 */
export function resolveE2EDatabaseUrl(env: Record<string, string | undefined>): ResolvedE2EDatabase {
  const rawUrl = env.E2E_DATABASE_URL ?? env.DATABASE_URL;

  if (!rawUrl) {
    throw new E2EDatabaseConfigError(
      "Neither E2E_DATABASE_URL nor DATABASE_URL is set. Playwright needs an explicit, isolated database URL to run against — refusing to start.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new E2EDatabaseConfigError(
      "The selected database URL could not be parsed. Refusing to start (not printing it — it may contain credentials).",
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  const looksIsolated = ISOLATED_SUFFIXES.some((suffix) => databaseName.toLowerCase().endsWith(suffix));

  if (!looksIsolated) {
    throw new E2EDatabaseConfigError(
      `Database "${databaseName}" does not look isolated (expected a name ending in ${ISOLATED_SUFFIXES.join(" or ")}). ` +
        "Playwright E2E runs upload files, run real workers, and mutate real records — refusing to run against what looks like the normal database.",
    );
  }

  return { url: rawUrl, databaseName };
}

/**
 * Env overrides shared by every Playwright `webServer` entry — only the
 * database selection, deliberately never a full `process.env` spread (each
 * child process already inherits the parent environment on its own; this
 * only needs to override the one value that must never come from that
 * child's own dotenv resolution).
 */
export function buildSharedE2EEnv(url: string): { DATABASE_URL: string } {
  return { DATABASE_URL: url };
}

/** Prints only the database name — never the username, password, host, port, or query string. */
export function logSelectedDatabase(databaseName: string): void {
  console.log(`[playwright] Using isolated database: ${databaseName}`);
}
