"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PackageCheck, AlertTriangle } from "lucide-react";

export interface ApprovalOnlyDeliveryPanelProps {
  token: string;
}

type Phase = "loading" | "preparing" | "preparation_failed" | "claiming" | "unlocked" | "claim_failed";

interface StatusResponse {
  workspaceStatus: string;
  downloadReady: boolean;
  deliveryFailed: boolean;
}

function phaseFromStatus(status: StatusResponse): Phase {
  if (status.workspaceStatus === "FILES_UNLOCKED" || status.workspaceStatus === "DELIVERED") return "unlocked";
  if (status.workspaceStatus === "AWAITING_CREATOR_RELEASE") return status.deliveryFailed ? "preparation_failed" : "preparing";
  return "preparing";
}

/**
 * The APPROVAL_ONLY equivalent of `PaymentPanel`'s post-approval delivery
 * surface — no payment/checkout step at all, and no manual freelancer
 * release step either: approval alone automatically enqueues delivery
 * server-side (see approveWorkspace calling ensureApprovedDeliveryEnqueued
 * in src/data-access/approvals.ts). Polls the same generalized delivery-status endpoint
 * PaymentPanel uses (its "payments" path name predates this reuse, but
 * `getClientPaymentStatus` has been mode-agnostic since the Part 5 fix —
 * see src/data-access/payment-orders.ts) and, once a DownloadGrant exists,
 * claims a fresh single-use `/download/[token]` session via
 * `POST /api/review/[token]/downloads/claim` — never a bookmarkable URL
 * handed back directly from the status poll itself.
 */
export function ApprovalOnlyDeliveryPanel({ token }: ApprovalOnlyDeliveryPanelProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const claimedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const claimDownload = useCallback(async () => {
    if (claimedRef.current) return;
    claimedRef.current = true;
    setPhase("claiming");
    try {
      const res = await fetch(`/api/review/${token}/downloads/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPhase("claim_failed");
        return;
      }
      setDownloadPath(data.downloadPath);
      setPhase("unlocked");
    } catch {
      claimedRef.current = false;
      setPhase("claim_failed");
    }
  }, [token]);

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
      const next = phaseFromStatus(status);
      if (next === "unlocked") {
        stopPolling();
        void claimDownload();
        return;
      }
      setPhase(next);
      if (next === "preparation_failed") stopPolling();
    },
    [stopPolling, claimDownload],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await fetchStatus();
      if (cancelled) return;
      if (status) {
        applyStatus(status);
        if (status.workspaceStatus === "AWAITING_CREATOR_RELEASE" && !status.deliveryFailed) {
          stopPolling();
          pollRef.current = setInterval(async () => {
            const next = await fetchStatus();
            if (next) applyStatus(next);
          }, 3000);
        }
      } else {
        setPhase("preparing");
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const wrap = (children: React.ReactNode, isError = false) => (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="flex flex-col items-center gap-2 rounded-md border border-white/10 bg-black/20 p-4 text-center"
    >
      {children}
    </div>
  );

  if (phase === "loading") {
    return wrap(<p className="text-sm text-slate-400">Loading delivery status…</p>);
  }

  if (phase === "preparing") {
    return wrap(
      <>
        <Loader2 size={22} className="animate-spin text-vault-blue" aria-hidden="true" />
        <p className="text-sm font-semibold text-success">Files Approved</p>
        <p className="text-sm font-semibold text-white">Preparing your final files…</p>
        <p className="text-xs text-slate-400">Your approved originals are being securely packaged for download. This usually takes a moment.</p>
      </>,
    );
  }

  if (phase === "claiming") {
    return wrap(
      <>
        <Loader2 size={22} className="animate-spin text-vault-blue" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Preparing your secure download…</p>
      </>,
    );
  }

  if (phase === "unlocked") {
    return wrap(
      <>
        <PackageCheck size={24} className="text-success" aria-hidden="true" />
        <p className="text-sm font-semibold text-success">Files released</p>
        <p className="text-xs text-slate-400">Your approved originals are ready for secure download.</p>
        {downloadPath && (
          <a
            href={downloadPath}
            className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
          >
            Download Approved Files
          </a>
        )}
      </>,
    );
  }

  if (phase === "preparation_failed") {
    return wrap(
      <>
        <AlertTriangle size={22} className="text-warning" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">We hit a snag preparing your files</p>
        <p className="text-xs text-slate-400">
          The freelancer has been notified and can retry preparation. Your approval is safe.
        </p>
      </>,
    );
  }

  // "claim_failed"
  return wrap(
    <>
      <AlertTriangle size={22} className="text-danger" aria-hidden="true" />
      <p className="text-sm font-semibold text-white">Could not prepare your download</p>
      <button
        type="button"
        onClick={() => {
          claimedRef.current = false;
          void claimDownload();
        }}
        className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        Try Again
      </button>
    </>,
    true,
  );
}
