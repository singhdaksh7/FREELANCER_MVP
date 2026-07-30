import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getPaymentConfig, __resetPaymentConfigCacheForTests } from "./payment-config";
import { PaymentConfigError } from "./payment-errors";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  __resetPaymentConfigCacheForTests();
}

/** @types/node marks `process.env.NODE_ENV` read-only; this test deliberately needs to flip it per-case (same pattern as src/storage/storage-config.test.ts). */
function setEnv(key: string, value: string) {
  (process.env as Record<string, string>)[key] = value;
}

describe("payment-config production guards", () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  it("defaults to the fake provider outside production", () => {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    delete process.env.PAYMENT_PROVIDER;
    const config = getPaymentConfig();
    expect(config.provider).toBe("fake");
  });

  it("refuses to start with the fake provider in production", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "fake";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("refuses to start with RAZORPAY_MODE=test in production even with the razorpay provider", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_abc123";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("refuses to start when the key id doesn't look live, even with RAZORPAY_MODE=live", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "live";
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_abc123";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("refuses to start when a secret still looks like a development placeholder", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "live";
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc123";
    process.env.RAZORPAY_KEY_SECRET = "replace-with-a-real-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_live_abc123";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("refuses to start when the public key id doesn't match the server key id", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "live";
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_live_different";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("accepts a fully valid live production configuration", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "live";
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_live_abc123";
    const config = getPaymentConfig();
    expect(config.provider).toBe("razorpay");
    expect(config.mode).toBe("live");
  });

  it("throws for an invalid PAYMENT_PROVIDER value", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("allows RAZORPAY_MODE=test in production when APP_ENV=demo (the INLAY demo deployment)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("APP_ENV", "demo");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_abc123";
    const config = getPaymentConfig();
    expect(config.provider).toBe("razorpay");
    expect(config.mode).toBe("test");
  });

  it("still refuses the fake provider under APP_ENV=demo in production", () => {
    setEnv("NODE_ENV", "production");
    setEnv("APP_ENV", "demo");
    process.env.PAYMENT_PROVIDER = "fake";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("still requires the public key id to match the server key id under APP_ENV=demo", () => {
    setEnv("NODE_ENV", "production");
    setEnv("APP_ENV", "demo");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_different";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });

  it("does not weaken the live-mode guard when APP_ENV is unset (not demo)", () => {
    setEnv("NODE_ENV", "production");
    process.env.PAYMENT_PROVIDER = "razorpay";
    process.env.RAZORPAY_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc123";
    process.env.RAZORPAY_KEY_SECRET = "a_real_looking_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "another_real_looking_secret";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_abc123";
    expect(() => getPaymentConfig()).toThrow(PaymentConfigError);
  });
});
