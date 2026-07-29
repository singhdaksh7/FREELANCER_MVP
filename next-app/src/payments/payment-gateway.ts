// Deliberately does NOT `import "server-only"` — the fake gateway backs
// integration/E2E tests that run outside Next's bundler, and this
// interface must stay importable from there too.

/**
 * Provider-agnostic payment-gateway abstraction — business logic (data
 * access, route handlers) depends only on this shape, never directly on
 * Razorpay's API or SDK. See PAYMENT_ARCHITECTURE.md "Gateway
 * abstraction." `razorpay-gateway.ts` is the production implementation
 * (plain REST calls, no SDK dependency); `fake-payment-gateway.ts` is a
 * deterministic in-memory implementation used only by automated tests and
 * isolated local E2E runs — never selectable in production (see
 * payment-config.ts's assertProductionSafe).
 */

export interface CreateOrderInput {
  amountSubunits: bigint;
  currency: string;
  /** A short, unique reference the gateway can echo back — never contains PII. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface GatewayOrder {
  id: string;
  amountSubunits: bigint;
  currency: string;
  status: string;
  receipt: string | null;
}

export interface GatewayPayment {
  id: string;
  orderId: string;
  amountSubunits: bigint;
  currency: string;
  /** Razorpay's own payment.entity status values: "created" | "authorized" | "captured" | "refunded" | "failed". */
  status: string;
  method: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export interface VerifyCheckoutSignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyWebhookSignatureInput {
  rawBody: string;
  signature: string;
}

export interface PaymentGateway {
  readonly providerName: "razorpay" | "fake";
  createOrder(input: CreateOrderInput): Promise<GatewayOrder>;
  fetchOrder(orderId: string): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  verifyCheckoutSignature(input: VerifyCheckoutSignatureInput): boolean;
  verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean;
}
