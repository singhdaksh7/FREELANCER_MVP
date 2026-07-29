// Deliberately does NOT `import "server-only"` — see payment-config.ts's
// comment (must remain importable from the delivery worker / reconciliation
// path outside Next's bundler). Never imported from a Client Component.

import { getPaymentConfig } from "./payment-config";
import { verifyCheckoutSignature as verifyCheckoutSig, verifyWebhookSignature as verifyWebhookSig } from "./payment-signatures";
import { PaymentGatewayError } from "./payment-errors";
import type {
  PaymentGateway,
  CreateOrderInput,
  GatewayOrder,
  GatewayPayment,
  VerifyCheckoutSignatureInput,
  VerifyWebhookSignatureInput,
} from "./payment-gateway";

/**
 * Production Razorpay implementation — plain REST calls against Razorpay's
 * documented Orders/Payments API (https://api.razorpay.com/v1), signed
 * with HTTP Basic Auth (key id : key secret), rather than the official
 * Node SDK. Keeps this app's dependency surface smaller and the request
 * shape fully explicit; the abstraction (PaymentGateway) is what actually
 * matters — business logic never imports this file directly, only
 * src/payments/index.ts's provider-selected instance.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  const { keyId, keySecret } = getPaymentConfig();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function razorpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: authHeader(), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Razorpay request failed (network):", error);
    throw new PaymentGatewayError();
  }

  if (!response.ok) {
    // Never surface the raw Razorpay error body (may contain account
    // details) — log server-side only, return a safe generic error.
    const body = await response.text().catch(() => "");
    console.error(`Razorpay API error ${response.status}:`, body);
    throw new PaymentGatewayError();
  }

  return (await response.json()) as T;
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string | null;
}

interface RazorpayPaymentResponse {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  error_code: string | null;
  error_description: string | null;
}

function mapOrder(order: RazorpayOrderResponse): GatewayOrder {
  return {
    id: order.id,
    amountSubunits: BigInt(order.amount),
    currency: order.currency,
    status: order.status,
    receipt: order.receipt,
  };
}

function mapPayment(payment: RazorpayPaymentResponse): GatewayPayment {
  return {
    id: payment.id,
    orderId: payment.order_id,
    amountSubunits: BigInt(payment.amount),
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    errorCode: payment.error_code,
    errorDescription: payment.error_description,
  };
}

export const razorpayGateway: PaymentGateway = {
  providerName: "razorpay",

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const order = await razorpayFetch<RazorpayOrderResponse>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: Number(input.amountSubunits),
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      }),
    });
    return mapOrder(order);
  },

  async fetchOrder(orderId: string): Promise<GatewayOrder> {
    const order = await razorpayFetch<RazorpayOrderResponse>(`/orders/${encodeURIComponent(orderId)}`);
    return mapOrder(order);
  },

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const payment = await razorpayFetch<RazorpayPaymentResponse>(`/payments/${encodeURIComponent(paymentId)}`);
    return mapPayment(payment);
  },

  verifyCheckoutSignature(input: VerifyCheckoutSignatureInput): boolean {
    const { keySecret } = getPaymentConfig();
    return verifyCheckoutSig({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature, keySecret });
  },

  verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
    const { webhookSecret } = getPaymentConfig();
    return verifyWebhookSig({ rawBody: input.rawBody, signature: input.signature, webhookSecret });
  },
};
