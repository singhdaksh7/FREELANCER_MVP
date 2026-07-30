"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, Lock, AlertTriangle, Loader2, PackageCheck } from "lucide-react";
import { formatINR } from "@/lib/format-currency";
import { loadRazorpayCheckoutScript, openRazorpayCheckout } from "./razorpay-checkout";

export interface PaymentPanelProps {
  token: string;
  amount: number;
  currency: string;
  workspaceTitle: string;
  creatorName: string;
  clientName: string;
}

type Phase =
  | "loading"
  | "ready"
  | "creating_order"
  | "checkout_open"
  | "checkout_dismissed"
  | "verifying"
  | "failed"
  | "captured"
  | "preparing"
  | "preparation_failed"
  | "unlocked";

interface StatusResponse {
  paymentId: string | null;
  status: string | null;
  workspaceStatus: string;
  downloadUrl: string | null;
  deliveryFailed: boolean;
}

function phaseFromStatus(status: StatusResponse): Phase {
  if (status.workspaceStatus === "FILES_UNLOCKED" || status.workspaceStatus === "DELIVERED") return "unlocked";
  if (status.workspaceStatus === "PAID") return status.deliveryFailed ? "preparation_failed" : "preparing";
  if (status.status === "FAILED") return "failed";
  if (status.status === "PENDING") return "verifying";
  return "ready";
}

/**
 * The Phase 7 payment surface embedded in the client review portal's
 * "approved" state — see PAYMENT_ARCHITECTURE.md. Never shows a success
 * message directly from the Checkout callback; after a verified callback
 * it always shows "Payment received. Confirming settlement…" and only
 * a server-confirmed (webhook/reconciliation) status ever advances the UI
 * past that. A page refresh at any point re-derives phase from the server
 * (GET .../payments/status), never from localStorage.
 */
export function PaymentPanel({ token, amount, currency, workspaceTitle, creatorName, clientName }: PaymentPanelProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconcileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (reconcileTimeoutRef.current) clearTimeout(reconcileTimeoutRef.current);
    reconcileTimeoutRef.current = null;
  }, []);

  const fetchStatus = useCallback(async (): Promise<StatusResponse | null> => {
    try {
      const res = await fetch(`/api/review/${token}/payments/status`);
      if (!res.ok) return null;
      return (await res.json()) as StatusResponse;
    } catch {
      return null;
    }
  }, [token]);

  const applyStatus = useCallback(
    (status: StatusResponse) => {
      if (status.downloadUrl) setDownloadUrl(status.downloadUrl);
      const next = phaseFromStatus(status);
      setPhase(next);
      if (next === "unlocked" || next === "failed" || next === "preparation_failed") stopPolling();
    },
    [stopPolling],
  );

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus();
      if (status) applyStatus(status);
    }, 3000);
    // If a webhook hasn't landed within a few seconds, actively reconcile once.
    reconcileTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/review/${token}/payments/reconcile`, { method: "POST" });
      } catch {
        // Best-effort — the poll loop above will pick up a later webhook regardless.
      }
    }, 6000);
  }, [stopPolling, fetchStatus, applyStatus, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await fetchStatus();
      if (cancelled) return;
      if (status) {
        applyStatus(status);
        if (status.status === "PENDING" || status.workspaceStatus === "PAID") startPolling();
      } else {
        setPhase("ready");
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function handlePay() {
    setError(null);
    setPhase("creating_order");
    try {
      const orderRes = await fetch(`/api/review/${token}/payments/orders`, { method: "POST" });
      const order = await orderRes.json();
      if (!orderRes.ok) {
        setError(order.error ?? "We could not start a payment for this project.");
        setPhase("failed");
        return;
      }

      await loadRazorpayCheckoutScript();
      setPhase("checkout_open");

      const instance = openRazorpayCheckout({
        key: order.keyId,
        amount: order.amountSubunits,
        currency: order.currency,
        name: order.creatorName,
        description: order.workspaceTitle,
        order_id: order.orderId,
        prefill: { name: order.clientName },
        theme: { color: "#3B82F6" },
        modal: { ondismiss: () => setPhase((p) => (p === "checkout_open" ? "checkout_dismissed" : p)) },
        handler: async (response) => {
          setPhase("verifying");
          try {
            const verifyRes = await fetch(`/api/review/${token}/payments/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (!verifyRes.ok) {
              const body = await verifyRes.json().catch(() => ({}));
              setError(body.error ?? "This payment could not be verified.");
              setPhase("failed");
              return;
            }
            startPolling();
          } catch {
            setError("Network error while confirming your payment. It may still complete — please refresh in a moment.");
            setPhase("verifying");
            startPolling();
          }
        },
      });

      instance.on("payment.failed", () => {
        setError("Your payment could not be completed. No charge was made — you can try again.");
        setPhase("failed");
      });
    } catch {
      setError("We could not open the secure payment window. Please try again.");
      setPhase("failed");
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div className="flex flex-col items-center gap-2 rounded-md border border-white/10 bg-black/20 p-4 text-center">
      {children}
    </div>
  );

  if (phase === "loading") {
    return wrap(<p className="text-sm text-slate-400">Loading payment status…</p>);
  }

  if (phase === "unlocked") {
    return wrap(
      <>
        <PackageCheck size={24} className="text-success" aria-hidden="true" />
        <p className="text-sm font-semibold text-success">Files unlocked</p>
        <p className="text-xs text-slate-400">Your originals are ready for secure download.</p>
        {downloadUrl && (
          <a
            href={downloadUrl}
            className="mt-1 inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90"
          >
            Go to Your Downloads
          </a>
        )}
      </>,
    );
  }

  if (phase === "preparing") {
    return wrap(
      <>
        <Loader2 size={22} className="animate-spin text-vault-blue" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Payment received. Preparing your files…</p>
        <p className="text-xs text-slate-400">Your originals are being securely packaged for download. This usually takes a moment.</p>
      </>,
    );
  }

  if (phase === "verifying" || phase === "checkout_open" || phase === "creating_order") {
    return wrap(
      <>
        <Loader2 size={22} className="animate-spin text-vault-blue" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">
          {phase === "creating_order" ? "Starting secure payment…" : phase === "checkout_open" ? "Waiting for Checkout…" : "Payment received. Confirming settlement…"}
        </p>
        <p className="text-xs text-slate-400">Original files remain locked until payment is confirmed server-side.</p>
      </>,
    );
  }

  if (phase === "preparation_failed") {
    return wrap(
      <>
        <AlertTriangle size={22} className="text-warning" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Your payment succeeded</p>
        <p className="text-xs text-slate-400">
          We hit a snag preparing your files for secure download. Your payment is safe — you will not be asked to pay
          again. The creator has been notified and can retry preparation.
        </p>
      </>,
    );
  }

  if (phase === "failed") {
    return wrap(
      <>
        <AlertTriangle size={22} className="text-danger" aria-hidden="true" />
        <p className="text-sm font-semibold text-danger">Payment failed</p>
        <p className="text-xs text-slate-400">{error ?? "Your payment could not be completed. No charge was made."}</p>
        <button
          type="button"
          onClick={handlePay}
          className="mt-1 inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90"
        >
          Try Again
        </button>
      </>,
    );
  }

  if (phase === "checkout_dismissed") {
    return wrap(
      <>
        <AlertTriangle size={20} className="text-warning" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Checkout closed</p>
        <p className="text-xs text-slate-400">You closed the payment window before completing checkout. No charge was made.</p>
        <button
          type="button"
          onClick={handlePay}
          className="mt-1 inline-flex items-center justify-center rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90"
        >
          Resume Payment
        </button>
      </>,
    );
  }

  // "ready"
  return wrap(
    <>
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-vault-blue" aria-hidden="true" />
        <p className="text-sm font-bold text-white">{formatINR(amount)} due</p>
      </div>
      <p className="text-xs text-slate-400">
        Secure payment processed through Razorpay. Original files unlock only after your payment is confirmed. This is
        payment-gated delivery, not an escrow service.
      </p>
      <button
        type="button"
        onClick={handlePay}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-success px-5 py-2.5 text-sm font-semibold text-white hover:bg-success/90"
      >
        <Lock size={14} aria-hidden="true" /> Pay and Unlock Files
      </button>
      <p className="text-[11px] text-slate-500">
        {creatorName} · {workspaceTitle} · {clientName}
      </p>
      {currency !== "INR" && <p className="text-[11px] text-warning">Unsupported currency: {currency}</p>}
    </>,
  );
}
