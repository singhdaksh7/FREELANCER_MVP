import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getPayoutProvider, __resetPayoutProviderCacheForTests } from "./payout-provider";
import { LiveProviderNotImplementedError } from "./payout-errors";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  __resetPayoutProviderCacheForTests();
}

/** @types/node marks `process.env.NODE_ENV` read-only; flipped per-case, same pattern as payment-config.test.ts. */
function setEnv(key: string, value: string) {
  (process.env as Record<string, string>)[key] = value;
}

describe("payout-provider production guard", () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  it("resolves the fake provider outside production", async () => {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    const provider = await getPayoutProvider();
    expect(provider.name).toBe("fake");
  });

  it("refuses to run any payout simulation in production", async () => {
    setEnv("NODE_ENV", "production");
    await expect(getPayoutProvider()).rejects.toBeInstanceOf(LiveProviderNotImplementedError);
  });

  it("refuses in production even if PAYOUT_PROVIDER is left at its default", async () => {
    setEnv("NODE_ENV", "production");
    delete process.env.PAYOUT_PROVIDER;
    await expect(getPayoutProvider()).rejects.toBeInstanceOf(LiveProviderNotImplementedError);
  });
});
