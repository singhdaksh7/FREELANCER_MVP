import { randomBytes, randomUUID } from "node:crypto";
import { PaymentGatewayError } from "./payment-errors";
import { computeCheckoutSignature, computeWebhookSignature } from "./payment-signatures";
import type { PaymentGateway, CreateOrderInput, GatewayOrder, GatewayPayment } from "./payment-gateway";

/**
 * Deterministic, entirely in-memory test double for PaymentGateway — see
 * PAYMENT_ARCHITECTURE.md "Test payment provider." Used only by unit/
 * integration tests and isolated local E2E runs (PAYMENT_PROVIDER="fake");
 * `payment-config.ts`'s production guard refuses to select this provider
 * when NODE_ENV=production. Real HMAC-SHA256 signatures are still
 * computed (with fixed test secrets below), so signature-verification
 * code paths are exercised for real — only the "is this order/payment
 * real" state is faked, never the cryptography.
 */

export const FAKE_KEY_SECRET = "fake_test_key_secret_do_not_use_in_prod";
export const FAKE_WEBHOOK_SECRET = "fake_test_webhook_secret_do_not_use_in_prod";

const orders = new Map<string, GatewayOrder>();
const payments = new Map<string, GatewayPayment>();

export const fakePaymentGateway: PaymentGateway = {
  providerName: "fake",

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const id = `order_fake_${randomBytes(10).toString("hex")}`;
    const order: GatewayOrder = {
      id,
      amountSubunits: input.amountSubunits,
      currency: input.currency,
      status: "created",
      receipt: input.receipt,
    };
    orders.set(id, order);
    return order;
  },

  async fetchOrder(orderId: string): Promise<GatewayOrder> {
    const order = orders.get(orderId);
    if (!order) throw new PaymentGatewayError("Unknown order.");
    return order;
  },

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const payment = payments.get(paymentId);
    if (!payment) throw new PaymentGatewayError("Unknown payment.");
    return payment;
  },

  verifyCheckoutSignature({ orderId, paymentId, signature }) {
    const expected = computeCheckoutSignature(orderId, paymentId, FAKE_KEY_SECRET);
    return expected === signature;
  },

  verifyWebhookSignature({ rawBody, signature }) {
    const expected = computeWebhookSignature(rawBody, FAKE_WEBHOOK_SECRET);
    return expected === signature;
  },
};

// ---------------------------------------------------------------------
// Test-only helpers below. Never imported from application code — only
// from tests and the local isolated E2E fixture setup.
// ---------------------------------------------------------------------

/** Simulates the browser completing Razorpay Checkout: registers a new payment ("authorized") against an existing order and returns a genuinely valid checkout signature for it. */
export function fakeGatewaySimulateCheckout(
  orderId: string,
  opts?: { paymentId?: string; amountSubunits?: bigint; currency?: string },
): { paymentId: string; signature: string } {
  const order = orders.get(orderId);
  if (!order) throw new Error(`fakeGatewaySimulateCheckout: unknown order "${orderId}"`);

  const paymentId = opts?.paymentId ?? `pay_fake_${randomBytes(10).toString("hex")}`;
  const signature = computeCheckoutSignature(orderId, paymentId, FAKE_KEY_SECRET);

  payments.set(paymentId, {
    id: paymentId,
    orderId,
    amountSubunits: opts?.amountSubunits ?? order.amountSubunits,
    currency: opts?.currency ?? order.currency,
    status: "authorized",
    method: "card",
    errorCode: null,
    errorDescription: null,
  });

  return { paymentId, signature };
}

/** Moves a previously-registered fake payment to "captured" or "failed" — mirrors what a real gateway does asynchronously after authorization. */
export function fakeGatewaySetPaymentStatus(
  paymentId: string,
  status: "authorized" | "captured" | "failed",
  overrides?: Partial<Pick<GatewayPayment, "errorCode" | "errorDescription">>,
): GatewayPayment {
  const payment = payments.get(paymentId);
  if (!payment) throw new Error(`fakeGatewaySetPaymentStatus: unknown payment "${paymentId}"`);
  const updated: GatewayPayment = { ...payment, status, ...overrides };
  payments.set(paymentId, updated);
  return updated;
}

export interface FakeWebhookEnvelope {
  eventId: string;
  eventType: "payment.captured" | "payment.failed" | "payment.authorized" | "order.paid";
  rawBody: string;
  signature: string;
}

/**
 * Builds a genuinely-signed fake webhook delivery for a registered payment
 * — used to exercise the real webhook route handler end to end in tests,
 * including duplicate-event (reuse the same eventId), out-of-order
 * (deliver payment.captured before/after payment.failed for the same
 * payment), and amount/currency-mismatch (pass explicit overrides) cases.
 */
export function fakeGatewayBuildWebhookEvent(
  eventType: FakeWebhookEnvelope["eventType"],
  payment: GatewayPayment,
  opts?: { eventId?: string; amountSubunitsOverride?: bigint; currencyOverride?: string },
): FakeWebhookEnvelope {
  const eventId = opts?.eventId ?? `evt_fake_${randomUUID()}`;
  const entity = {
    id: payment.id,
    order_id: payment.orderId,
    amount: Number(opts?.amountSubunitsOverride ?? payment.amountSubunits),
    currency: opts?.currencyOverride ?? payment.currency,
    status: eventType === "payment.captured" ? "captured" : eventType === "payment.failed" ? "failed" : payment.status,
    method: payment.method,
    error_code: payment.errorCode,
    error_description: payment.errorDescription,
  };
  const body = {
    entity: "event",
    account_id: "acc_fake",
    event: eventType,
    contains: ["payment"],
    payload: { payment: { entity } },
    created_at: Math.floor(Date.now() / 1000),
  };
  const rawBody = JSON.stringify(body);
  const signature = computeWebhookSignature(rawBody, FAKE_WEBHOOK_SECRET);
  return { eventId, eventType, rawBody, signature };
}

/** Resets all in-memory state — call between test cases so gateway state never leaks across tests. */
export function __resetFakeGatewayForTests(): void {
  orders.clear();
  payments.clear();
}
