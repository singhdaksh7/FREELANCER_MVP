"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CREATOR_MOBILE_PRIMARY_NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/cn";

/**
 * Fixed bottom navigation, mobile only. Shows the same first-5 primary
 * destinations as the original CreatorLayout.jsx (`navItems.slice(0, 5)`)
 * — Settings was never reachable from here in the approved design and
 * still isn't; it now lives in the mobile drawer instead (see
 * CreatorMobileHeader), which the original had no equivalent of.
 */
export function CreatorMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[60px] items-center justify-around border-t border-vault-navy-light bg-vault-navy md:hidden"
    >
      {CREATOR_MOBILE_PRIMARY_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-w-11 flex-col items-center gap-0.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue",
              isActive ? "font-semibold text-vault-blue" : "text-slate-400",
            )}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
