#!/usr/bin/env node
/**
 * Render "start command" for the INLAY web service (Service A — see
 * render.yaml). Runs, in order:
 *   1. `prisma migrate deploy` — using DIRECT_URL (Neon's non-pooled
 *      connection) if set, since schema migrations run better over a
 *      direct connection than through Neon's PgBouncer pooler; falls back
 *      to DATABASE_URL if DIRECT_URL isn't set (e.g. local smoke-testing).
 *      Never `prisma migrate dev` / `db push` / a destructive reset.
 *   2. The idempotent demo seed, only when RUN_DEMO_SEED=true — safe to
 *      leave on for every deploy, since prisma/seed-demo.ts never deletes
 *      anything and converges to the same dataset on every run.
 *   3. `next start` only. This process never starts the file-processing
 *      or delivery workers — those run as their own Render Free Web
 *      Service (Service B, scripts/worker/combined-worker entrypoint).
 */
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function run(name, command, args, extraEnv = {}) {
  console.log(`[render-web-entrypoint] Running ${name}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`[render-web-entrypoint] ${name} failed (exit code ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

// Step 1: apply migrations. Prefer DIRECT_URL for the migration itself —
// never prisma migrate dev / db push / reset in this path.
run("prisma migrate deploy", "npx", ["prisma", "migrate", "deploy"], {
  DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

// Step 2: optional idempotent demo seed.
if (process.env.RUN_DEMO_SEED === "true") {
  run("demo seed", "npm", ["run", "db:seed:demo"]);
} else {
  console.log("[render-web-entrypoint] RUN_DEMO_SEED is not \"true\" — skipping demo seed.");
}

// Step 3: start Next.js only — no worker child processes, no supervisor.
// Uses spawn (not spawnSync) + inherited stdio + direct signal forwarding
// so this process doesn't hang around as an unnecessary extra parent once
// Next.js is up; SIGTERM/SIGINT from Render are forwarded straight through.
const port = process.env.PORT ?? "3000";
const nextBin = require.resolve("next/dist/bin/next");

const next = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", "0.0.0.0"], {
  stdio: "inherit",
  env: process.env,
});

process.on("SIGTERM", () => next.kill("SIGTERM"));
process.on("SIGINT", () => next.kill("SIGINT"));

next.on("exit", (code) => {
  process.exit(code ?? 0);
});
