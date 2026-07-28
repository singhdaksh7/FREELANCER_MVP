#!/usr/bin/env node
/**
 * Safety gate for destructive/DB-touching npm scripts (`db:reset`,
 * `test:integration`). Refuses to run against anything that doesn't look
 * like a local development database, so a mistyped or inherited
 * DATABASE_URL can never point one of these commands at a real
 * environment. Exits non-zero (blocking the chained command) on any
 * doubt.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const isTestMode = process.argv.includes("--allow-test-suffix");
const envFile = isTestMode ? ".env.test" : ".env";
const varName = isTestMode ? "TEST_DATABASE_URL" : "DATABASE_URL";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const contents = readFileSync(path, "utf8");
  const values = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileValues = loadEnvFile(resolve(process.cwd(), envFile));
const rawUrl = process.env[varName] ?? fileValues[varName];

if (!rawUrl) {
  console.error(
    `\n✖ ${varName} is not set (checked process.env and ${envFile}). Refusing to run.\n`,
  );
  process.exit(1);
}

let url;
try {
  url = new URL(rawUrl);
} catch {
  console.error(`\n✖ ${varName} is not a valid URL. Refusing to run.\n`);
  process.exit(1);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
if (!LOCAL_HOSTS.has(url.hostname)) {
  console.error(
    `\n✖ ${varName} points at host "${url.hostname}", which does not look like a local database.\n` +
      `  This command is destructive and is only allowed against localhost. Refusing to run.\n` +
      `  If you really need to run this against a remote database, do it manually and deliberately\n` +
      `  outside this npm script — never via db:reset/test:integration.\n`,
  );
  process.exit(1);
}

if (isTestMode) {
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName.toLowerCase().includes("test")) {
    console.error(
      `\n✖ ${varName} database name "${dbName}" does not contain "test".\n` +
        `  Integration tests run destructive setup/teardown — point ${varName} at a dedicated\n` +
        `  test database (e.g. "project_vault_test") to avoid wiping development data.\n`,
    );
    process.exit(1);
  }
}

console.log(`✓ ${varName} looks like a safe local ${isTestMode ? "test " : ""}database (${url.hostname}). Proceeding.`);
