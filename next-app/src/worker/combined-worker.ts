/**
 * Combined demo worker — `npm run start:render-worker` (Service B in
 * render.yaml). Render's Free tier only offers Web Services, not
 * Background Workers, so this is one Node process that:
 *   1. Sequentially claims and processes both file-processing jobs
 *      (job-processor.ts) and delivery-bundle jobs
 *      (delivery-job-processor.ts) via combined-worker-loop.ts's
 *      runCombinedLoop — file jobs are checked first on every pass,
 *      delivery jobs second, at most one job active at a time.
 *   2. Exposes a tiny HTTP server (combined-worker-server.ts) on
 *      process.env.PORT so Render treats it as a valid Free Web Service
 *      (GET /health) and so the web service can shorten the idle-poll
 *      wait after queuing a job (POST /wake).
 *
 * This file only wires those two pieces to one real Prisma client — it
 * adds no financial, storage, locking, or retry logic of its own, and is
 * deliberately thin so the interesting behavior lives in the two
 * unit-tested modules above. Compiled ahead of time (see package.json's
 * build:worker) — no tsx or TypeScript compiler at runtime.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getWorkerConfig } from "../storage/storage-config";
import { claimNextJob, processJob } from "./job-processor";
import { claimNextDeliveryJob, processDeliveryJob } from "./delivery-job-processor";
import { runCombinedLoop, createInterruptibleWait } from "./combined-worker-loop";
import { createWakeServer } from "./combined-worker-server";
import { createShutdown } from "./combined-worker-lifecycle";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const { wait, wake } = createInterruptibleWait();

const { shutdown, isShuttingDown } = createShutdown({
  closeServer: () => new Promise<void>((resolve) => server.close(() => resolve())),
  disconnectPrisma: () => prisma.$disconnect(),
  wake,
  exit: (code) => process.exit(code),
  log: (message) => console.log(message),
});

const server = createWakeServer({
  wakeSecret: process.env.WORKER_WAKE_SECRET,
  onWake: wake,
  isShuttingDown,
});

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`[combined-worker] HTTP server listening on 0.0.0.0:${port} (/health, /wake).`);
});

const { pollIntervalMs } = getWorkerConfig();
runCombinedLoop({
  claimNextFileJob: () => claimNextJob(prisma),
  processFileJob: (job) => processJob(prisma, job),
  claimNextDeliveryJob: () => claimNextDeliveryJob(prisma),
  processDeliveryJob: (job) => processDeliveryJob(prisma, job),
  wait,
  pollIntervalMs,
  isShuttingDown,
}).catch((error) => {
  console.error("[combined-worker] Crashed:", error);
  process.exitCode = 1;
  void shutdown();
});
