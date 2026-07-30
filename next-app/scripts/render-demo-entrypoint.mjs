#!/usr/bin/env node
/**
 * Render "start command" for the INLAY demo web service (see render.yaml).
 * Runs, in order:
 *   1. `prisma migrate deploy` — using DIRECT_URL (Neon's non-pooled
 *      connection) if set, since schema migrations run better over a
 *      direct connection than through Neon's PgBouncer pooler; falls back
 *      to DATABASE_URL if DIRECT_URL isn't set (e.g. local smoke-testing).
 *      Never `prisma migrate dev` / `db push` / a destructive reset.
 *   2. The idempotent demo seed, only when RUN_DEMO_SEED=true — safe to
 *      leave on for every deploy, since prisma/seed-demo.ts never deletes
 *      anything and converges to the same dataset on every run.
 *   3. The combined-process supervisor (start-demo.mjs), which itself
 *      re-validates APP_ENV=demo && DEMO_COMBINED_PROCESS=true.
 */
import { spawnSync, spawn } from "node:child_process";

function run(name, command, args, extraEnv = {}) {
  console.log(`[render-demo-entrypoint] Running ${name}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`[render-demo-entrypoint] ${name} failed (exit code ${result.status}).`);
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
  console.log("[render-demo-entrypoint] RUN_DEMO_SEED is not \"true\" — skipping demo seed.");
}

// Step 3: hand off to the combined-process supervisor. Uses spawn (not
// spawnSync) + inherited stdio so start-demo.mjs's own SIGTERM/SIGINT
// handling and this process's lifecycle stay in sync — Render sends
// signals to this process group, and we want start-demo.mjs to receive
// and act on them directly rather than through a second indirection layer.
const supervisor = spawn("node", ["scripts/start-demo.mjs"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.on("SIGTERM", () => supervisor.kill("SIGTERM"));
process.on("SIGINT", () => supervisor.kill("SIGINT"));

supervisor.on("exit", (code) => {
  process.exit(code ?? 0);
});
