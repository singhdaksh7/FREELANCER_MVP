import type { ReactNode } from "react";
import type { AuthenticatedCreator } from "@/data-access/auth";
import { CreatorSidebar } from "./creator-sidebar";
import { CreatorHeader } from "./creator-header";
import { CreatorMobileHeader } from "./creator-mobile-header";
import { CreatorMobileNav } from "./creator-mobile-nav";

export interface CreatorShellProps {
  creator: AuthenticatedCreator;
  unreadNotificationCount: number;
  children: ReactNode;
}

/**
 * Creator application shell: 248px desktop sidebar + sticky header,
 * or compact mobile header + bottom nav.
 */
export function CreatorShell({ creator, unreadNotificationCount, children }: CreatorShellProps) {
  return (
    <div className="min-h-screen bg-app-bg">
      <CreatorSidebar creator={creator} unreadNotificationCount={unreadNotificationCount} />
      <CreatorMobileHeader creator={creator} unreadNotificationCount={unreadNotificationCount} />

      <div className="flex min-h-screen flex-col pb-mobile-nav md:pb-0 md:pl-[248px]">
        <CreatorHeader unreadNotificationCount={unreadNotificationCount} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <CreatorMobileNav />
    </div>
  );
}
