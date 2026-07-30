import { getPaymentConfig } from "./payment-config";
import { razorpayGateway } from "./razorpay-gateway";
import { fakePaymentGateway } from "./fake-payment-gateway";
import type { PaymentGateway } from "./payment-gateway";

/**
 * Single provider-selection point — every other module (data-access,
 * route handlers, the delivery worker) imports `getPaymentGateway()`, never
 * `razorpay-gateway.ts`/`fake-payment-gateway.ts` directly. See
 * PAYMENT_ARCHITECTURE.md "Gateway abstraction."
 */
export function getPaymentGateway(): PaymentGateway {
  const { provider } = getPaymentConfig();
  return provider === "fake" ? fakePaymentGateway : razorpayGateway;
}

export * from "./payment-gateway";
export * from "./payment-errors";
export * from "./payment-amount";
