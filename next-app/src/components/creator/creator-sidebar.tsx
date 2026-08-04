import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import type { AuthenticatedCreator } from "@/data-access/auth";
import { LinkButton } from "@/components/ui/link-button";
import { InlayLogo } from "@/components/brand/inlay-logo";
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
        className="flex items-center border-b border-[#16203D] px-6 py-5"
      >
        <InlayLogo container size="lg" />
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
