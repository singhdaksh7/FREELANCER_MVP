#!/usr/bin/env node
/**
 * Runs the idempotent demo seed (prisma/seed-demo.ts) against DATABASE_URL.
 * Only ever invoked after scripts/guard-demo-db.mjs has confirmed
 * APP_ENV=demo — see the "db:seed:demo" npm script.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsx", "prisma/seed-demo.ts"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
