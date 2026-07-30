/**
 * Safe BigInt <-> number conversion for file sizes. Prisma's `BigInt`
 * columns (`WorkspaceFile.sizeBytes` etc.) exist specifically so a file
 * size can never silently overflow a 32-bit `Int` column — this is the
 * one, single point where that BigInt is ever converted to a plain
 * `number` for display/JSON, and it fails loudly rather than silently
 * losing precision if a value somehow exceeded the safe integer range
 * (in practice, every size here stays far below it).
 */
export function bigIntToDisplayNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(0)) {
    throw new Error("File size is outside the safely representable range");
  }
  return Number(value);
}

export function numberToStorageBigInt(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Cannot convert ${value} to a storage byte count`);
  }
  return BigInt(Math.trunc(value));
}

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** Formats a byte count as e.g. "4.2 MB" for display. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${UNITS[exponent]}`;
}
