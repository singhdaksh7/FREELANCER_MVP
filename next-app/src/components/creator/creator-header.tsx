import { Search } from "lucide-react";
import { NotificationTrigger } from "./notification-trigger";

export interface CreatorHeaderProps {
  unreadNotificationCount: number;
}

/** Sticky desktop header (hidden on mobile in favor of CreatorMobileHeader). */
export function CreatorHeader({ unreadNotificationCount }: CreatorHeaderProps) {
  return (
    <header className="sticky top-0 z-30 hidden h-header items-center justify-between border-b border-line bg-white px-6 md:flex">
      <div className="relative w-[280px]">
        <input
          type="search"
          placeholder="Search workspaces, clients, files..."
          aria-label="Search workspaces, clients, files"
          className="w-full rounded-md border border-line bg-slate-50 py-2 pl-9 pr-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        />
        <Search
          size={16}
          color="#94A3B8"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
      </div>

      <div className="flex items-center gap-4">
        <NotificationTrigger unreadCount={unreadNotificationCount} />
      </div>
    </header>
  );
}
