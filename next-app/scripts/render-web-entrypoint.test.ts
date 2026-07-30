import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "render-web-entrypoint.mjs"), "utf8");

describe("scripts/render-web-entrypoint.mjs", () => {
  it("never spawns/execs the file-processing or delivery worker entry points", () => {
    // Strip comments first — the file's doc comment legitimately *mentions*
    // these paths and commands to document what this entrypoint must never
    // do; what matters is that no spawn/run call actually invokes them.
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toContain("process-files");
    expect(codeOnly).not.toContain("process-deliveries");
    expect(codeOnly).not.toContain("combined-worker");
    expect(codeOnly).not.toContain("worker:files");
    expect(codeOnly).not.toContain("worker:deliveries");
    expect(codeOnly).not.toContain("start-demo");
  });

  it("starts Next.js directly, bound to PORT and 0.0.0.0", () => {
    expect(source).toMatch(/next\/dist\/bin\/next/);
    expect(source).toContain('"start"');
    expect(source).toContain("0.0.0.0");
    expect(source).toContain("process.env.PORT");
  });

  it("runs prisma migrate deploy, never a destructive/dev migration command", () => {
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly).toMatch(/\["prisma",\s*"migrate",\s*"deploy"\]/);
    expect(codeOnly).not.toContain("migrate dev");
    expect(codeOnly).not.toContain("db push");
    expect(codeOnly).not.toContain("migrate reset");
  });

  it("forwards SIGTERM/SIGINT to the Next.js child and exits with its code", () => {
    expect(source).toContain('process.on("SIGTERM"');
    expect(source).toContain('process.on("SIGINT"');
    expect(source).toContain("next.kill");
  });
});
