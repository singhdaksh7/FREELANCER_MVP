"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";

/** Route error boundary. Must be a Client Component (Next.js requirement). */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-vault-navy p-6 text-white">
      <div className="max-w-[480px] rounded-lg border border-white/10 bg-vault-navy-light p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
          <WifiOff size={28} color="#EF4444" aria-hidden="true" />
        </div>
        <p className="text-sm font-extrabold uppercase tracking-wide text-vault-blue">
          System State [500]
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">Something Went Wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          An unexpected error occurred while rendering this page.
        </p>

        <div className="mt-7 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-vault-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-vault-blue-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue focus-visible:ring-offset-2"
          >
            Try Again
          </button>
          <LinkButton
            href="/"
            variant="ghost"
            className="border border-white/20 text-slate-400"
          >
            Home Landing
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
