import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ENV_KEYS = [
  "MAX_FILE_SIZE_BYTES",
  "MAX_WORKSPACE_STORAGE_BYTES",
  "MAX_DELIVERY_BUNDLE_BYTES",
  "PREVIEW_MAX_DIMENSION",
  "SHARP_CONCURRENCY",
  "FILE_WORKER_CONCURRENCY",
  "DELIVERY_WORKER_CONCURRENCY",
];

const originalEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

/** Pulls a numeric envVars[].value out of render.yaml for a given service by name and key, without a YAML parser dependency. */
function renderYamlEnvValue(serviceName: string, key: string): string {
  const yaml = readFileSync(path.resolve(__dirname, "../../render.yaml"), "utf8");
  const serviceStart = yaml.indexOf(`name: ${serviceName}`);
  expect(serviceStart, `service "${serviceName}" not found in render.yaml`).toBeGreaterThan(-1);
  const nextServiceStart = yaml.indexOf("\n  - type: web", serviceStart + 1);
  const serviceBlock = yaml.slice(serviceStart, nextServiceStart === -1 ? undefined : nextServiceStart);
  const match = serviceBlock.match(new RegExp(`key: ${key}\\n\\s*value: "?([^"\\n]+)"?`));
  expect(match, `key "${key}" not found for service "${serviceName}"`).not.toBeNull();
  return match![1]!.trim();
}

describe("demo memory limits (render.yaml -> src/storage/storage-config.ts)", () => {
  it("worker service's render.yaml values stay under the free-demo caps this task specifies", () => {
    expect(Number(renderYamlEnvValue("inlay-demo-worker", "MAX_FILE_SIZE_BYTES"))).toBe(5 * 1024 * 1024);
    expect(Number(renderYamlEnvValue("inlay-demo-worker", "MAX_WORKSPACE_STORAGE_BYTES"))).toBe(20 * 1024 * 1024);
    expect(Number(renderYamlEnvValue("inlay-demo-worker", "MAX_DELIVERY_BUNDLE_BYTES"))).toBe(20 * 1024 * 1024);
    expect(Number(renderYamlEnvValue("inlay-demo-worker", "PREVIEW_MAX_DIMENSION"))).toBe(1200);
    expect(renderYamlEnvValue("inlay-demo-worker", "SHARP_CONCURRENCY")).toBe("1");
    expect(renderYamlEnvValue("inlay-demo-worker", "FILE_WORKER_CONCURRENCY")).toBe("1");
    expect(renderYamlEnvValue("inlay-demo-worker", "DELIVERY_WORKER_CONCURRENCY")).toBe("1");
  });

  it("storage-config.ts reads exactly the env var names set in render.yaml for these limits", async () => {
    process.env.MAX_FILE_SIZE_BYTES = "5242880";
    process.env.MAX_WORKSPACE_STORAGE_BYTES = "20971520";
    process.env.MAX_DELIVERY_BUNDLE_BYTES = "20971520";
    process.env.PREVIEW_MAX_DIMENSION = "1200";
    process.env.SHARP_CONCURRENCY = "1";
    process.env.FILE_WORKER_CONCURRENCY = "1";
    process.env.DELIVERY_WORKER_CONCURRENCY = "1";

    const { getUploadLimits, getPreviewLimits, getDeliveryWorkerConfig, getSharpConcurrency, getWorkerConfig } =
      await import("./storage-config");

    expect(getUploadLimits().maxFileSizeBytes).toBe(5 * 1024 * 1024);
    expect(getUploadLimits().maxTotalWorkspaceBytes).toBe(20 * 1024 * 1024);
    expect(getPreviewLimits().maxOutputDimensionPx).toBe(1200);
    expect(getDeliveryWorkerConfig().maxBundleBytes).toBe(20 * 1024 * 1024);
    expect(getDeliveryWorkerConfig().concurrency).toBe(1);
    expect(getWorkerConfig().concurrency).toBe(1);
    expect(getSharpConcurrency()).toBe(1);
  });
});
