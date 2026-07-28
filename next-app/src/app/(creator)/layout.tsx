import type { ReactNode } from "react";
import { CreatorShell } from "@/components/creator/creator-shell";
import { CREATOR, NOTIFICATIONS } from "@/data/mock";

/**
 * Shared chrome for every creator-facing screen. This route group exists
 * only to organize files — it does not add a `/creator` URL segment (Next
 * route groups never do), so `/dashboard`, `/workspaces`, etc. stay exactly
 * where the brief requires them.
 */
export default function CreatorRouteGroupLayout({ children }: { children: ReactNode }) {
  const unreadNotificationCount = NOTIFICATIONS.filter((n) => !n.read).length;

  return (
    <CreatorShell creator={CREATOR} unreadNotificationCount={unreadNotificationCount}>
      {children}
    </CreatorShell>
  );
}
