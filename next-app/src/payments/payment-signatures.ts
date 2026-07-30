import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay's own HMAC-SHA256 signature scheme — see PAYMENT_ARCHITECTURE.md
 * "Signature verification" and WEBHOOK_SECURITY.md "Signature validation."
 * Deliberately does NOT `import "server-only"` — src/worker and the
 * standalone fake-gateway test helpers need these too (same pre-existing
 * constraint as src/storage/storage-config.ts).
 */

function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time hex-digest comparison — never a `===` string compare on secret-derived values. */
function hexDigestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Checkout-callback signature: HMAC-SHA256 of `"{order_id}|{payment_id}"`
 * using the key secret. This is the exact scheme Razorpay's Standard
 * Checkout uses — see PAYMENT_ARCHITECTURE.md "Checkout callback."
 */
export function computeCheckoutSignature(orderId: string, paymentId: string, keySecret: string): string {
  return hmacSha256Hex(`${orderId}|${paymentId}`, keySecret);
}

export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const expected = computeCheckoutSignature(input.orderId, input.paymentId, input.keySecret);
  return hexDigestsEqual(expected, input.signature.toLowerCase());
}

/**
 * Webhook signature: HMAC-SHA256 of the exact raw request body using the
 * webhook secret (a different secret from the key secret) — see
 * WEBHOOK_SECURITY.md "Raw-body verification." The body must be the
 * untouched raw text `request.text()` returned, never a re-serialized
 * `JSON.stringify(parsedBody)`, or the signature will never match.
 */
export function computeWebhookSignature(rawBody: string, webhookSecret: string): string {
  return hmacSha256Hex(rawBody, webhookSecret);
}

export function verifyWebhookSignature(input: { rawBody: string; signature: string; webhookSecret: string }): boolean {
  const expected = computeWebhookSignature(input.rawBody, input.webhookSecret);
  return hexDigestsEqual(expected, input.signature.toLowerCase());
}
