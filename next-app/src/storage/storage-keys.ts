import { randomBytes } from "node:crypto";

/**
 * The three prefixes every object in the single storage bucket lives
 * under — see FILE_STORAGE_ARCHITECTURE.md "Storage-key rules."
 * `temp/` objects are pre-verification uploads; `originals/` and
 * `previews/` are only ever populated by the server after verification,
 * never written to directly by a client.
 */
export const STORAGE_PREFIXES = {
  temp: "temp",
  originals: "originals",
  previews: "previews",
  /// Phase 7 — private ZIP delivery bundles, one per captured payment. See
  /// SECURE_DOWNLOAD_ARCHITECTURE.md. Configurable via DELIVERY_BUNDLE_PREFIX
  /// (see storage-config.ts's getDeliveryWorkerConfig).
  deliveries: "deliveries",
} as const;

export type StoragePrefix = (typeof STORAGE_PREFIXES)[keyof typeof STORAGE_PREFIXES];

const RANDOM_BYTES = 24; // 192 bits — not guessable, not derived from any database id.

/**
 * Generates an opaque, cryptographically random storage key. Deliberately
 * never incorporates a database id as its only unpredictable element —
 * ids are sequential/enumerable in ways a storage key must not be.
 */
export function generateStorageKey(prefix: StoragePrefix, extensionHint?: string): string {
  const random = randomBytes(RANDOM_BYTES).toString("hex");
  const safeExtension = extensionHint
    ? `.${extensionHint.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8)}`
    : "";
  return `${prefix}/${random}${safeExtension}`;
}

/**
 * Same random-key scheme as generateStorageKey, but takes the prefix as a
 * plain string — the delivery-bundle prefix is configurable
 * (DELIVERY_BUNDLE_PREFIX, see storage-config.ts's getDeliveryWorkerConfig),
 * unlike the fixed temp/originals/previews prefixes above.
 */
export function generateDeliveryBundleKey(prefix: string): string {
  const random = randomBytes(RANDOM_BYTES).toString("hex");
  return `${prefix}/${random}.zip`;
}
