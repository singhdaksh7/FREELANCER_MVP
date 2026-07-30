"use client";

import { useEffect } from "react";
import { AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route error boundary for every creator screen (dashboard/workspaces/
 * clients/payments/notifications) — catches database-unavailable and
 * other unexpected server errors. Always shows a generic message; the
 * real error (which may include a Prisma/SQL message) is only logged
 * server/console-side via `console.error`, never rendered to the user.
 */
export default function CreatorRouteGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Creator route error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-lg border border-line bg-surface-card p-10 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg">
        <AlertOctagon size={28} color="#EF4444" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink">Something went wrong</h2>
        <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
          We couldn&apos;t load this page. This is usually temporary — please try again in a moment.
        </p>
      </div>
      <Button type="button" onClick={reset}>
        Try Again
      </Button>
    </div>
  );
}
