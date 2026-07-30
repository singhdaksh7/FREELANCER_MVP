"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CREATOR_NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/cn";

export interface CreatorNavigationProps {
  unreadNotificationCount: number;
  /** Called after a link is activated — used by the mobile drawer to close itself. */
  onNavigate?: () => void;
}

/**
 * Primary creator nav link list (desktop sidebar + mobile drawer share
 * this). Active state is derived from the current pathname, which is why
 * this is a Client Component — the rest of the sidebar/header stays server
 * rendered.
 */
export function CreatorNavigation({ unreadNotificationCount, onNavigate }: CreatorNavigationProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Creator navigation" className="flex flex-col gap-1 px-3 py-2">
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Main Menu
      </p>
      {CREATOR_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        const badge = item.id === "notifications" ? unreadNotificationCount : 0;

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            title={item.deferred ? "Available in a later phase" : undefined}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue",
              isActive
                ? "bg-vault-navy-light font-semibold text-white"
                : "font-medium text-slate-400 hover:text-white",
            )}
          >
            <span className="flex items-center gap-3">
              <Icon size={18} color={isActive ? "var(--color-vault-blue)" : "#94A3B8"} aria-hidden="true" />
              <span>
                {item.label}
                {item.deferred && <span className="sr-only"> (available in a later phase)</span>}
              </span>
            </span>
            {badge > 0 && (
              <span className="rounded-full bg-vault-blue px-1.5 py-0.5 text-[11px] font-bold text-white">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
