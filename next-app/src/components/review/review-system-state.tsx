import type { LucideIcon } from "lucide-react";
import { SystemStateLayout } from "@/components/layout/system-state-layout";

export interface ReviewSystemStateProps {
  code: string;
  title: string;
  message: string;
  icon: LucideIcon;
}

/**
 * Client review portal's system-state screens (invalid/expired/revoked
 * token, workspace unavailable, no files yet). Never links to
 * `/dashboard` — a client here has no creator account. See
 * CLIENT_REVIEW_ARCHITECTURE.md "Error and system states."
 */
export function ReviewSystemState({ code, title, message, icon }: ReviewSystemStateProps) {
  return (
    <SystemStateLayout
      code={code}
      title={title}
      message={message}
      icon={icon}
      actions={
        <p className="text-xs text-slate-400">
          If you believe this is a mistake, contact the person who shared this link with you.
        </p>
      }
    />
  );
}
