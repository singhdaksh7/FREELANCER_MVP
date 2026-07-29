// Deliberately does NOT `import "server-only"` — src/worker/process-deliveries.ts
// and the reconciliation cron-equivalent path need this from outside
// Next's bundler too (same pre-existing constraint as
// src/storage/storage-config.ts, which this file mirrors closely).

import { PaymentConfigError } from "./payment-errors";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new PaymentConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new PaymentConfigError(`Invalid value for ${name}: "${raw}" (expected a positive integer)`);
  }
  return parsed;
}

export type PaymentProviderName = "razorpay" | "fake";
export type RazorpayMode = "test" | "live";

export interface PaymentConfig {
  provider: PaymentProviderName;
  /** Client-visible key id — safe to send to the browser (Razorpay's own design: the key id is a public identifier, never a secret). */
  publicKeyId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: RazorpayMode;
}

/** Razorpay's own key-id prefix convention — "rzp_test_..." vs "rzp_live_...". Used to cross-check the declared RAZORPAY_MODE against what the key itself claims to be, independent of that env var. */
function keyLooksLikeMode(keyId: string, mode: RazorpayMode): boolean {
  if (mode === "test") return keyId.startsWith("rzp_test_");
  return keyId.startsWith("rzp_live_");
}

const DEV_SECRET_MARKERS = ["dev", "test-secret", "changeme", "replace-with"];

function assertProductionSafe(config: PaymentConfig): void {
  if (process.env.NODE_ENV !== "production") return;

  if (config.provider === "fake") {
    throw new PaymentConfigError("Refusing to start: PAYMENT_PROVIDER=\"fake\" is forbidden in production.");
  }
  if (config.mode !== "live") {
    throw new PaymentConfigError(
      `Refusing to start: RAZORPAY_MODE="${config.mode}" (test keys) is forbidden while NODE_ENV=production.`,
    );
  }
  if (!keyLooksLikeMode(config.keyId, "live")) {
    throw new PaymentConfigError(
      "Refusing to start: RAZORPAY_KEY_ID does not look like a live key (\"rzp_live_...\") while NODE_ENV=production and RAZORPAY_MODE=\"live\".",
    );
  }
  if (config.publicKeyId !== config.keyId) {
    throw new PaymentConfigError(
      "Refusing to start: NEXT_PUBLIC_RAZORPAY_KEY_ID must match RAZORPAY_KEY_ID — a mismatched public key would open Checkout against the wrong account/mode.",
    );
  }
  const secretLooksDev = DEV_SECRET_MARKERS.some(
    (marker) => config.keySecret.toLowerCase().includes(marker) || config.webhookSecret.toLowerCase().includes(marker),
  );
  if (secretLooksDev) {
    throw new PaymentConfigError(
      "Refusing to start: RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET still looks like a development placeholder while NODE_ENV=production.",
    );
  }
  if (!config.keySecret || !config.webhookSecret) {
    throw new PaymentConfigError("Refusing to start: RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are both required in production.");
  }
}

let cachedConfig: PaymentConfig | null = null;

/** Reads and validates payment-gateway configuration once, caching the result for the process lifetime — mirrors src/storage/storage-config.ts's getStorageConfig(). */
export function getPaymentConfig(): PaymentConfig {
  if (cachedConfig) return cachedConfig;

  const provider = (process.env.PAYMENT_PROVIDER ?? "fake") as PaymentProviderName;
  if (provider !== "razorpay" && provider !== "fake") {
    throw new PaymentConfigError(`Invalid PAYMENT_PROVIDER: "${provider}" (expected "razorpay" or "fake").`);
  }

  const mode = (process.env.RAZORPAY_MODE ?? "test") as RazorpayMode;
  if (mode !== "test" && mode !== "live") {
    throw new PaymentConfigError(`Invalid RAZORPAY_MODE: "${mode}" (expected "test" or "live").`);
  }

  const config: PaymentConfig = {
    provider,
    publicKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
    mode,
  };

  if (provider === "razorpay") {
    config.keyId = requireEnv("RAZORPAY_KEY_ID");
    config.keySecret = requireEnv("RAZORPAY_KEY_SECRET");
    config.webhookSecret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
    if (!config.publicKeyId) {
      throw new PaymentConfigError("Missing required environment variable: NEXT_PUBLIC_RAZORPAY_KEY_ID");
    }
  }

  assertProductionSafe(config);
  cachedConfig = config;
  return config;
}

/** Test-only hook to reset the module-level cache between test cases that reconfigure env vars. Never called from application code. */
export function __resetPaymentConfigCacheForTests(): void {
  cachedConfig = null;
}

export interface ReconciliationConfig {
  cooldownSeconds: number;
}

export function getReconciliationConfig(): ReconciliationConfig {
  return { cooldownSeconds: intEnv("PAYMENT_RECONCILIATION_COOLDOWN", 30) };
}
