import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import type { AuthenticatedCreator } from "@/data-access/auth";
import { LinkButton } from "@/components/ui/link-button";
import { BRAND } from "@/lib/branding";
import { CreatorNavigation } from "./creator-navigation";
import { CreatorProfile } from "./creator-profile";

export interface CreatorSidebarProps {
  creator: AuthenticatedCreator;
  unreadNotificationCount: number;
}

/**
 * Fixed 248px desktop sidebar per Stitch UI specifications (#10182F background).
 */
export function CreatorSidebar({ creator, unreadNotificationCount }: CreatorSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#16203D] bg-primary-navy text-white md:flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 border-b border-[#16203D] px-6 py-5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-blue">
          <Image src="/branding/icon-mark.png" alt="" width={18} height={18} aria-hidden="true" />
        </span>
        <span>
          <span className="block text-base font-bold tracking-tight text-white">
            {BRAND.productName}
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-secondary-text">
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
