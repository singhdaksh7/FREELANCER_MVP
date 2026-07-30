#!/usr/bin/env node
/**
 * Safety gate for `db:seed:demo`. Unlike guard-local-db.mjs (which only
 * allows destructive commands against localhost), this seed is meant to
 * run against a real hosted (Neon) demo database — so instead of checking
 * the hostname, it refuses to run unless the caller has explicitly opted
 * into demo mode via APP_ENV=demo. This keeps a mistyped/inherited
 * DATABASE_URL from ever causing prisma/seed-demo.ts to run against a
 * non-demo (e.g. production) environment.
 */
import { config } from "dotenv";

config();

if (process.env.APP_ENV !== "demo") {
  console.error(
    `\n✖ APP_ENV is "${process.env.APP_ENV ?? "unset"}", not "demo". Refusing to run the demo seed.\n` +
      `  Set APP_ENV=demo explicitly if you really intend to seed a demo database.\n`,
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("\n✖ DATABASE_URL is not set. Refusing to run the demo seed.\n");
  process.exit(1);
}

console.log("✓ APP_ENV=demo and DATABASE_URL is set. Proceeding with demo seed.");
