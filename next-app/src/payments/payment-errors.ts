/**
 * Shared error classes for the payment-gateway abstraction and the
 * finalization/reconciliation services built on top of it — see
 * PAYMENT_ARCHITECTURE.md. Kept generic/gateway-level here; workflow-level
 * errors (e.g. "workspace not approved") live in
 * src/data-access/payment-orders.ts alongside the functions that throw
 * them, matching this app's existing per-module error convention.
 */

/** Configuration is missing/invalid, or a production guard rejected the current setup — see payment-config.ts. */
export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

/** The gateway (Razorpay, or the fake test provider) itself returned an error creating/fetching an order or payment. Never carries the raw gateway response — see PAYMENT_ARCHITECTURE.md "Error redaction." */
export class PaymentGatewayError extends Error {
  constructor(message = "The payment provider could not complete this request.") {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

/** A Checkout-callback or webhook signature failed verification. Never includes the signature or secret in the message. */
export class InvalidSignatureError extends Error {
  constructor(message = "Payment signature verification failed.") {
    super(message);
    this.name = "InvalidSignatureError";
  }
}

/** A captured payment's amount/currency did not match what this app expected — never trusted, always blocks finalization. */
export class AmountMismatchError extends Error {
  constructor(message = "Payment amount does not match the expected order amount.") {
    super(message);
    this.name = "AmountMismatchError";
  }
}

export class CurrencyMismatchError extends Error {
  constructor(message = "Payment currency does not match the expected order currency.") {
    super(message);
    this.name = "CurrencyMismatchError";
  }
}

/** A webhook/reconciliation referenced a gateway order id this app has no local Payment row for. */
export class UnknownOrderError extends Error {
  constructor(message = "No local payment record matches this order.") {
    super(message);
    this.name = "UnknownOrderError";
  }
}
