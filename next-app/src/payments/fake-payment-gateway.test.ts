import { describe, expect, it, beforeEach } from "vitest";
import {
  fakePaymentGateway,
  fakeGatewaySimulateCheckout,
  fakeGatewaySetPaymentStatus,
  fakeGatewayBuildWebhookEvent,
  __resetFakeGatewayForTests,
} from "./fake-payment-gateway";

describe("fake payment gateway", () => {
  beforeEach(() => {
    __resetFakeGatewayForTests();
  });

  it("creates a deterministic order and can fetch it back", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    expect(order.id).toMatch(/^order_fake_/);
    const fetched = await fakePaymentGateway.fetchOrder(order.id);
    expect(fetched).toEqual(order);
  });

  it("throws for an unknown order id", async () => {
    await expect(fakePaymentGateway.fetchOrder("order_does_not_exist")).rejects.toThrow();
  });

  it("simulateCheckout registers a payment with a genuinely valid checkout signature", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    const { paymentId, signature } = fakeGatewaySimulateCheckout(order.id);

    expect(fakePaymentGateway.verifyCheckoutSignature({ orderId: order.id, paymentId, signature })).toBe(true);
    expect(fakePaymentGateway.verifyCheckoutSignature({ orderId: order.id, paymentId, signature: "wrong" })).toBe(false);
  });

  it("moves a simulated payment through authorized -> captured", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    const { paymentId } = fakeGatewaySimulateCheckout(order.id);

    const authorized = await fakePaymentGateway.fetchPayment(paymentId);
    expect(authorized.status).toBe("authorized");

    fakeGatewaySetPaymentStatus(paymentId, "captured");
    const captured = await fakePaymentGateway.fetchPayment(paymentId);
    expect(captured.status).toBe("captured");
  });

  it("moves a simulated payment through authorized -> failed with an error code", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    const { paymentId } = fakeGatewaySimulateCheckout(order.id);

    fakeGatewaySetPaymentStatus(paymentId, "failed", { errorCode: "BAD_CARD", errorDescription: "Card declined." });
    const failed = await fakePaymentGateway.fetchPayment(paymentId);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("BAD_CARD");
  });

  it("builds a genuinely-signed webhook event for a captured payment", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    const { paymentId } = fakeGatewaySimulateCheckout(order.id);
    const payment = fakeGatewaySetPaymentStatus(paymentId, "captured");

    const event = fakeGatewayBuildWebhookEvent("payment.captured", payment);
    expect(fakePaymentGateway.verifyWebhookSignature({ rawBody: event.rawBody, signature: event.signature })).toBe(true);
    expect(JSON.parse(event.rawBody).event).toBe("payment.captured");
  });

  it("supports a duplicate event id for testing webhook deduplication", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    const { paymentId } = fakeGatewaySimulateCheckout(order.id);
    const payment = fakeGatewaySetPaymentStatus(paymentId, "captured");

    const first = fakeGatewayBuildWebhookEvent("payment.captured", payment, { eventId: "evt_fixed" });
    const second = fakeGatewayBuildWebhookEvent("payment.captured", payment, { eventId: "evt_fixed" });
    expect(first.eventId).toBe(second.eventId);
  });

  it("supports an amount-mismatch override for testing amount-mismatch rejection", async () => {
    const order = await fakePaymentGateway.createOrder({ amountSubunits: BigInt(500000), currency: "INR", receipt: "pay_1" });
    const { paymentId } = fakeGatewaySimulateCheckout(order.id);
    const payment = fakeGatewaySetPaymentStatus(paymentId, "captured");

    const event = fakeGatewayBuildWebhookEvent("payment.captured", payment, { amountSubunitsOverride: BigInt(1) });
    const parsed = JSON.parse(event.rawBody);
    expect(parsed.payload.payment.entity.amount).toBe(1);
  });
});
