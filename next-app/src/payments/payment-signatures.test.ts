import { describe, expect, it } from "vitest";
import {
  computeCheckoutSignature,
  verifyCheckoutSignature,
  computeWebhookSignature,
  verifyWebhookSignature,
} from "./payment-signatures";

describe("checkout-signature verification", () => {
  const keySecret = "test_key_secret";

  it("accepts a correctly computed signature", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const signature = computeCheckoutSignature(orderId, paymentId, keySecret);
    expect(verifyCheckoutSignature({ orderId, paymentId, signature, keySecret })).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const signature = computeCheckoutSignature(orderId, paymentId, "wrong_secret");
    expect(verifyCheckoutSignature({ orderId, paymentId, signature, keySecret })).toBe(false);
  });

  it("rejects when the order id doesn't match what was signed", () => {
    const paymentId = "pay_xyz789";
    const signature = computeCheckoutSignature("order_abc123", paymentId, keySecret);
    expect(verifyCheckoutSignature({ orderId: "order_different", paymentId, signature, keySecret })).toBe(false);
  });

  it("rejects a garbage signature string", () => {
    expect(
      verifyCheckoutSignature({ orderId: "order_abc123", paymentId: "pay_xyz789", signature: "not-a-real-signature", keySecret }),
    ).toBe(false);
  });
});

describe("webhook-signature verification (raw body)", () => {
  const webhookSecret = "test_webhook_secret";

  it("accepts a signature computed over the exact raw body", () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });
    const signature = computeWebhookSignature(rawBody, webhookSecret);
    expect(verifyWebhookSignature({ rawBody, signature, webhookSecret })).toBe(true);
  });

  it("rejects when the body is re-serialized differently (even semantically identical JSON)", () => {
    const original = '{"event":"payment.captured","id":"evt_1"}';
    const reSerialized = JSON.stringify(JSON.parse(original), null, 2);
    const signature = computeWebhookSignature(original, webhookSecret);
    expect(verifyWebhookSignature({ rawBody: reSerialized, signature, webhookSecret })).toBe(false);
  });

  it("rejects a signature computed with the wrong webhook secret", () => {
    const rawBody = '{"event":"payment.failed"}';
    const signature = computeWebhookSignature(rawBody, "wrong_secret");
    expect(verifyWebhookSignature({ rawBody, signature, webhookSecret })).toBe(false);
  });

  it("rejects a tampered body even with a structurally valid signature format", () => {
    const rawBody = '{"event":"payment.captured","amount":100}';
    const signature = computeWebhookSignature(rawBody, webhookSecret);
    const tamperedBody = '{"event":"payment.captured","amount":999999}';
    expect(verifyWebhookSignature({ rawBody: tamperedBody, signature, webhookSecret })).toBe(false);
  });
});
