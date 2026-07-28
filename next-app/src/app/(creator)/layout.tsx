import type { ReactNode } from "react";
import { CreatorShell } from "@/components/creator/creator-shell";
import { requireCreatorRole } from "@/data-access/auth";
import { getUnreadNotificationCount } from "@/data-access/notifications";

/**
 * Shared chrome for every creator-facing screen. This route group exists
 * only to organize files — it does not add a `/creator` URL segment (Next
 * route groups never do), so `/dashboard`, `/workspaces`, etc. stay exactly
 * where the brief requires them.
 *
 * This is the *definitive* auth check (layer 2 of 2 — see
 * AUTH_DATABASE_ARCHITECTURE.md): `proxy.ts` redirects unauthenticated
 * requests optimistically, but every data-access function independently
 * re-verifies the session too, so this layout is never the only thing
 * standing between an unauthenticated request and creator data.
 */
export default async function CreatorRouteGroupLayout({ children }: { children: ReactNode }) {
  const creator = await requireCreatorRole();
  const unreadNotificationCount = await getUnreadNotificationCount();

  return (
    <CreatorShell creator={creator} unreadNotificationCount={unreadNotificationCount}>
      {children}
    </CreatorShell>
  );
}
