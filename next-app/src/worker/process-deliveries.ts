/**
 * Standalone delivery-bundle worker — `npm run worker:deliveries`.
 * Deliberately NOT part of the Next.js request/response cycle, same
 * reasoning as src/worker/process-files.ts: ZIP creation over potentially
 * many large original files must never run inside ordinary page
 * rendering or an HTTP request handler. Run this as its own long-lived
 * process in every environment.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDeliveryWorkerConfig } from "../storage/storage-config";
import { claimNextDeliveryJob, processDeliveryJob } from "./delivery-job-processor";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function runLoop(once: boolean): Promise<void> {
  const { pollIntervalMs } = getDeliveryWorkerConfig();
  let shuttingDown = false;
  process.on("SIGINT", () => {
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
  });

  for (;;) {
    if (shuttingDown) return;
    const job = await claimNextDeliveryJob(prisma);
    if (job) {
      await processDeliveryJob(prisma, job);
      if (once) return;
      continue;
    }
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

const runOnce = process.argv.includes("--once");

runLoop(runOnce)
  .catch((error) => {
    console.error("[delivery-worker] Crashed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
