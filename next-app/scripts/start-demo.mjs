#!/usr/bin/env node
/**
 * Combined-process supervisor for the INLAY demo deployment on Render's
 * free tier (one web service, no separate background-worker services).
 * Runs the Next.js production server plus both standalone workers
 * (worker:files, worker:deliveries) as child processes of one Node
 * process — see DEMO_DEPLOYMENT.md / RENDER_DEMO_RUNBOOK.md.
 *
 * This is a demo-only convenience, never a general production pattern:
 * it refuses to start unless both APP_ENV=demo and
 * DEMO_COMBINED_PROCESS=true are set, so it can never be accidentally
 * invoked by a real multi-service production deployment.
 *
 * Each child is started exactly once (no restart loop at all) — a crashed
 * worker is surfaced loudly via stderr rather than silently respawned,
 * and the web process exiting for any reason brings the whole supervisor
 * down, since Render's health check only watches the web port.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (process.env.APP_ENV !== "demo" || process.env.DEMO_COMBINED_PROCESS !== "true") {
  console.error(
    "[start-demo] Refusing to start: this combined-process supervisor requires both " +
      "APP_ENV=demo and DEMO_COMBINED_PROCESS=true. It must never run in a plain " +
      "production deployment — start the web app and workers as separate processes instead.",
  );
  process.exit(1);
}

const port = process.env.PORT ?? "3000";
const nextBin = require.resolve("next/dist/bin/next");
const tsxCli = require.resolve("tsx/cli");

/** name -> { proc, essential } — "essential" means its unexpected exit brings the whole supervisor down. */
const children = new Map();
let shuttingDown = false;

function prefixStream(name, stream, out) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) out.write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (buffer.length > 0) out.write(`[${name}] ${buffer}\n`);
  });
}

function startChild(name, args, { essential }) {
  if (children.has(name)) {
    // Should be unreachable (each name is started exactly once at boot),
    // but refuse loudly rather than silently running two of the same
    // worker against the same job queue.
    throw new Error(`[start-demo] Refusing to start a duplicate "${name}" process.`);
  }

  const proc = spawn(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  prefixStream(name, proc.stdout, process.stdout);
  prefixStream(name, proc.stderr, process.stderr);
  children.set(name, { proc, essential });

  proc.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;

    if (essential) {
      console.error(
        `[start-demo] "${name}" exited unexpectedly (code=${code}, signal=${signal}). ` +
          "This is the web process — shutting down the whole supervisor.",
      );
      shutdown(code ?? 1);
    } else {
      console.error(
        `[start-demo] "${name}" exited unexpectedly (code=${code}, signal=${signal}). ` +
          "It will NOT be restarted automatically — the web app keeps serving, but this " +
          "worker is no longer processing jobs. Investigate and redeploy.",
      );
    }
  });

  console.log(`[start-demo] Started "${name}" (pid ${proc.pid}).`);
  return proc;
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[start-demo] Shutting down…");

  for (const [name, { proc }] of children) {
    console.log(`[start-demo] Sending SIGTERM to "${name}" (pid ${proc.pid}).`);
    proc.kill("SIGTERM");
  }

  const forceKillTimer = setTimeout(() => {
    for (const [name, { proc }] of children) {
      console.error(`[start-demo] "${name}" did not exit in time — sending SIGKILL.`);
      proc.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 10_000);

  const checkInterval = setInterval(() => {
    if (children.size === 0) {
      clearInterval(checkInterval);
      clearTimeout(forceKillTimer);
      process.exit(exitCode);
    }
  }, 200);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

startChild("web", [nextBin, "start", "-p", port, "-H", "0.0.0.0"], { essential: true });
startChild("files-worker", [tsxCli, "src/worker/process-files.ts"], { essential: false });
startChild("deliveries-worker", [tsxCli, "src/worker/process-deliveries.ts"], { essential: false });
