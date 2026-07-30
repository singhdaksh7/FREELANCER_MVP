import { createHash } from "node:crypto";

/** SHA-256 hex digest — used for both `originalChecksum` and `previewChecksum` (see FileVersion). */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
