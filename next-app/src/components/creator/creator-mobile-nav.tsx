"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CREATOR_MOBILE_PRIMARY_NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/cn";

/**
 * Fixed bottom navigation, mobile only. Minimum 44px touch targets.
 */
export function CreatorMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[64px] items-center justify-around border-t border-[#16203D] bg-primary-navy md:hidden"
    >
      {CREATOR_MOBILE_PRIMARY_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 px-2 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-blue",
              isActive ? "font-semibold text-primary-blue" : "text-[#98A2B3]",
            )}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
