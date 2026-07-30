import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "combined-worker.ts"), "utf8");

/**
 * Structural checks on the combined worker's entry point itself — these
 * complement combined-worker-loop.test.ts / combined-worker-server.test.ts
 * / combined-worker-lifecycle.test.ts (which test the extracted, unit-
 * testable behavior) by proving the wiring file doesn't quietly grow a
 * second Prisma client, a child worker process, or a tsx dependency.
 */
describe("combined-worker.ts architecture", () => {
  it("instantiates exactly one PrismaClient", () => {
    const matches = source.match(/new PrismaClient\(/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("never spawns a child process (no tsx, no separate worker processes)", () => {
    expect(source).not.toContain("child_process");
    expect(source).not.toContain("spawn(");
    expect(source).not.toContain("exec(");
    expect(source).not.toContain('"tsx"');
    expect(source).not.toContain("tsx/cli");
  });

  it("never imports the standalone process-files/process-deliveries entry points", () => {
    expect(source).not.toContain("process-files");
    expect(source).not.toContain("process-deliveries");
  });

  it("does not start a Next.js server", () => {
    expect(source).not.toContain("next/dist/bin/next");
    expect(source).not.toContain('"next"');
  });

  it("reuses claimNextJob/processJob and claimNextDeliveryJob/processDeliveryJob rather than reimplementing them", () => {
    expect(source).toContain('from "./job-processor"');
    expect(source).toContain('from "./delivery-job-processor"');
  });
});
