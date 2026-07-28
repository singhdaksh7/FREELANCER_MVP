import type { ReactNode } from "react";
import type { Creator } from "@/types";
import { CreatorSidebar } from "./creator-sidebar";
import { CreatorHeader } from "./creator-header";
import { CreatorMobileHeader } from "./creator-mobile-header";
import { CreatorMobileNav } from "./creator-mobile-nav";

export interface CreatorShellProps {
  creator: Creator;
  unreadNotificationCount: number;
  children: ReactNode;
}

/**
 * Creator application chrome: 240px desktop sidebar + sticky desktop
 * header, or compact mobile header + bottom nav below the md breakpoint.
 * Stays a Server Component — only the pieces that need interactivity
 * (nav active-state, the mobile drawer) are Client Components.
 */
export function CreatorShell({ creator, unreadNotificationCount, children }: CreatorShellProps) {
  return (
    <div className="min-h-screen bg-surface">
      <CreatorSidebar creator={creator} unreadNotificationCount={unreadNotificationCount} />
      <CreatorMobileHeader creator={creator} unreadNotificationCount={unreadNotificationCount} />

      <div className="flex min-h-screen flex-col pb-mobile-nav md:pb-0 md:pl-sidebar">
        <CreatorHeader unreadNotificationCount={unreadNotificationCount} />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-6">{children}</main>
      </div>

      <CreatorMobileNav />
    </div>
  );
}
