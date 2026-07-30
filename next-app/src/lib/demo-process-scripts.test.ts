import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

function runGuard(scriptRelativePath: string, env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, scriptRelativePath)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("scripts/start-demo.mjs — combined-process guard", () => {
  it("refuses to start without APP_ENV=demo", () => {
    const result = runGuard("scripts/start-demo.mjs", {
      APP_ENV: undefined,
      DEMO_COMBINED_PROCESS: "true",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/APP_ENV=demo/);
  });

  it("refuses to start without DEMO_COMBINED_PROCESS=true even if APP_ENV=demo", () => {
    const result = runGuard("scripts/start-demo.mjs", {
      APP_ENV: "demo",
      DEMO_COMBINED_PROCESS: undefined,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/DEMO_COMBINED_PROCESS/);
  });

  it("refuses to start in a plain production configuration (no APP_ENV, no DEMO_COMBINED_PROCESS)", () => {
    const result = runGuard("scripts/start-demo.mjs", {
      NODE_ENV: "production",
      APP_ENV: undefined,
      DEMO_COMBINED_PROCESS: undefined,
    });
    expect(result.status).not.toBe(0);
  });
});

describe("scripts/guard-demo-db.mjs", () => {
  it("refuses to run without APP_ENV=demo", () => {
    const result = runGuard("scripts/guard-demo-db.mjs", {
      APP_ENV: undefined,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/demo/i);
  });

  it("refuses to run without DATABASE_URL even when APP_ENV=demo", () => {
    // Explicit empty string, not `undefined` — this repo's own .env (used
    // for local dev) sets a real DATABASE_URL, and guard-demo-db.mjs falls
    // back to loading .env the same way guard-local-db.mjs does, so an
    // "unset" env var here would otherwise still resolve via that file.
    const result = runGuard("scripts/guard-demo-db.mjs", {
      APP_ENV: "demo",
      DATABASE_URL: "",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/DATABASE_URL/);
  });

  it("passes when APP_ENV=demo and DATABASE_URL is set", () => {
    const result = runGuard("scripts/guard-demo-db.mjs", {
      APP_ENV: "demo",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    });
    expect(result.status).toBe(0);
  });
});

describe("scripts/start-demo.mjs — process supervision", () => {
  it(
    "starts exactly one instance each of web/files-worker/deliveries-worker and shuts down on SIGTERM",
    async () => {
      const child = spawn(
        process.execPath,
        [path.join(REPO_ROOT, "scripts/start-demo.mjs")],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, APP_ENV: "demo", DEMO_COMBINED_PROCESS: "true", PORT: "3993" },
        },
      );

      let output = "";
      child.stdout?.on("data", (chunk) => (output += chunk.toString()));
      child.stderr?.on("data", (chunk) => (output += chunk.toString()));

      // Wait until all three children have logged their startup line.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for startup. Output so far:\n${output}`)), 15_000);
        const interval = setInterval(() => {
          if (
            output.includes('Started "web"') &&
            output.includes('Started "files-worker"') &&
            output.includes('Started "deliveries-worker"')
          ) {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });

      // Each child name appears exactly once — no duplicate worker was started.
      expect(output.match(/Started "web"/g)?.length).toBe(1);
      expect(output.match(/Started "files-worker"/g)?.length).toBe(1);
      expect(output.match(/Started "deliveries-worker"/g)?.length).toBe(1);

      const exitPromise = new Promise<number | null>((resolve) => {
        child.on("exit", (code) => resolve(code));
      });
      child.kill("SIGTERM");

      const exitCode = await Promise.race([
        exitPromise,
        new Promise<number | null>((resolve) => setTimeout(() => resolve(undefined as unknown as number), 15_000)),
      ]);

      // The supervisor process itself must exit (not hang forever) once
      // asked to shut down — whether the workers had a chance to run their
      // own in-process graceful-shutdown handler is a POSIX-signal-delivery
      // detail this cross-platform test doesn't assert on directly.
      expect(exitCode).not.toBeUndefined();
    },
    20_000,
  );
});
