// Client-only helper. Loaded exclusively from payment-related client
// components (PaymentPanel) — never imported by any other part of the
// review portal, per PAYMENT_ARCHITECTURE.md "Load the Checkout script
// only on payment-related client components."

export interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutFailureResponse {
  error: { code: string; description: string; source?: string; step?: string; reason?: string };
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: string;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayCheckoutFailureResponse) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loadPromise: Promise<void> | null = null;

/** Loads Razorpay's Checkout script exactly once per page — cached so repeated "Pay" clicks never inject duplicate script tags. */
export function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load the payment provider's Checkout script."));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function openRazorpayCheckout(options: RazorpayCheckoutOptions): RazorpayInstance {
  if (!window.Razorpay) throw new Error("Checkout script has not loaded.");
  const instance = new window.Razorpay(options);
  instance.open();
  return instance;
}
