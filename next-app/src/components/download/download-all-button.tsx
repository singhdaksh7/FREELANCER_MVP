"use client";

import { useState } from "react";
import { Loader2, DownloadCloud } from "lucide-react";

export function DownloadAllButton({ token, bundleReady }: { token: string; bundleReady: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "preparing" | "error">("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch(`/api/download/${token}/bundle`, { redirect: "manual" });
      // A redirect (opaque or 3xx caught by "manual") means the bundle URL
      // is ready — navigate the browser there directly for the download.
      if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
        window.location.href = `/api/download/${token}/bundle`;
        setState("idle");
        return;
      }
      if (res.status === 202) {
        setState("preparing");
        return;
      }
      setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={!bundleReady || state === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-vault-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-vault-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <DownloadCloud size={16} aria-hidden="true" />}
        Download All Files
      </button>
      {!bundleReady && <p className="text-xs text-slate-400">Your delivery bundle is still being prepared.</p>}
      {state === "preparing" && <p className="text-xs text-warning">Still preparing — please try again shortly.</p>}
      {state === "error" && <p className="text-xs text-danger">Something went wrong. Please try again.</p>}
    </div>
  );
}
