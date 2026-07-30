/**
 * Standalone file-processing worker — `npm run worker:files`. Deliberately
 * NOT part of the Next.js request/response cycle (see the Phase 5 brief:
 * "Do not process large binary files inside normal page rendering," "Do
 * not claim Vercel page functions are the production worker
 * architecture"). Run this as its own long-lived process in every
 * environment — see FILE_PROCESSING_RUNBOOK.md for local startup and
 * production deployment guidance.
 *
 * Like prisma/seed.ts, this file instantiates its own Prisma client
 * rather than importing src/lib/prisma.ts's singleton, because that
 * singleton (and src/data-access/*) import the `server-only` package,
 * which throws unconditionally outside Next's bundler — this script runs
 * as plain Node via `tsx`, not through Next.js at all. The actual
 * claim/process logic lives in job-processor.ts, which takes a Prisma
 * client as a parameter for exactly this reason — it's also exercised
 * directly by src/data-access/files.integration.test.ts, using the app's
 * own (server-only-mocked-under-Vitest) client instead.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getWorkerConfig } from "../storage/storage-config";
import { claimNextJob, processJob } from "./job-processor";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function claimLoop(once: boolean, pollIntervalMs: number, isShuttingDown: () => boolean): Promise<void> {
  for (;;) {
    if (isShuttingDown()) return;
    const job = await claimNextJob(prisma);
    if (job) {
      await processJob(prisma, job);
      if (once) return;
      continue;
    }
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * Runs `concurrency` claim loops in parallel within this one process. Each
 * loop still claims exactly one job at a time via `FOR UPDATE SKIP LOCKED`
 * (job-processor.ts), so this is safe at any concurrency — it only lets a
 * single worker process handle more than one job at once. Default
 * concurrency of 1 (see FILE_WORKER_CONCURRENCY) is byte-for-byte the
 * original sequential behavior.
 */
async function runLoop(once: boolean): Promise<void> {
  const { pollIntervalMs, concurrency } = getWorkerConfig();
  let shuttingDown = false;
  process.on("SIGINT", () => {
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
  });

  await Promise.all(
    Array.from({ length: concurrency }, () => claimLoop(once, pollIntervalMs, () => shuttingDown)),
  );
}

const runOnce = process.argv.includes("--once");

runLoop(runOnce)
  .catch((error) => {
    console.error("[worker] Crashed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
