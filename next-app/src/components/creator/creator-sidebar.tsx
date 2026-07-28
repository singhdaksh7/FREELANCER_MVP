import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import type { Creator } from "@/types";
import { LinkButton } from "@/components/ui/link-button";
import { CreatorNavigation } from "./creator-navigation";
import { CreatorProfile } from "./creator-profile";

export interface CreatorSidebarProps {
  creator: Creator;
  unreadNotificationCount: number;
}

/**
 * Fixed 240px desktop sidebar. Hidden below the md breakpoint (768px) in
 * favor of the mobile header + bottom nav, matching the original
 * CreatorLayout.jsx `.desktop-sidebar { display: none }` media rule.
 */
export function CreatorSidebar({ creator, unreadNotificationCount }: CreatorSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-sidebar flex-col border-r border-vault-navy-light bg-vault-navy text-white md:flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 border-b border-vault-navy-light px-6 py-5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-vault-blue">
          <Lock size={18} color="#FFFFFF" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-base font-bold tracking-tight text-white">
            PROJECT VAULT
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">
            Payment-Gated Delivery
          </span>
        </span>
      </Link>

      <div className="px-5 py-4">
        <LinkButton href="/workspaces/new" className="w-full">
          <Plus size={16} aria-hidden="true" /> New Workspace
        </LinkButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        <CreatorNavigation unreadNotificationCount={unreadNotificationCount} />
      </div>

      <CreatorProfile creator={creator} />
    </aside>
  );
}
