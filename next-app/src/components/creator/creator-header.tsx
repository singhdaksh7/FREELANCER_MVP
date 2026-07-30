import { ExternalLink, Search } from "lucide-react";
import { NotificationTrigger } from "./notification-trigger";

export interface CreatorHeaderProps {
  unreadNotificationCount: number;
}

/**
 * Sticky desktop header (hidden on mobile in favor of CreatorMobileHeader).
 * The original's "Open Client Portal View" button hardcoded a demo token
 * and jumped straight into `/review/[token]`, which is deferred in this
 * phase — kept visually in place but disabled with an accessible reason,
 * per this phase's rule for actions with no real destination yet.
 */
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
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Client portal preview is available in a later phase"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-vault-blue/40 px-3 py-1.5 text-xs font-semibold text-vault-blue/40"
        >
          <ExternalLink size={14} aria-hidden="true" /> Open Client Portal View
        </button>

        <NotificationTrigger unreadCount={unreadNotificationCount} />
      </div>
    </header>
  );
}
