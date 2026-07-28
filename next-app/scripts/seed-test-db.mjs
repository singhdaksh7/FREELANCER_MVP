#!/usr/bin/env node
/**
 * Seeds the dedicated integration-test database (TEST_DATABASE_URL from
 * .env.test), by re-running prisma/seed.ts with DATABASE_URL temporarily
 * pointed at it. Never touches the development database.
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.test" });

if (!process.env.TEST_DATABASE_URL) {
  console.error("\n✖ TEST_DATABASE_URL is not set in .env.test. Refusing to seed.\n");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "db", "seed"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
});

process.exit(result.status ?? 1);
