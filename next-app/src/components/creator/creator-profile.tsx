import Link from "next/link";
import { LogOut } from "lucide-react";
import type { Creator } from "@/types";

export interface CreatorProfileProps {
  creator: Creator;
}

/**
 * Sidebar footer identity block. The original's "Logout" icon button had
 * no real auth to sign out of — it only navigated to `/`. This preserves
 * that exact (harmless) behavior rather than the login/register forms'
 * "no fake logic" rule, since there's no session being faked here.
 */
export function CreatorProfile({ creator }: CreatorProfileProps) {
  return (
    <div className="flex items-center gap-3 border-t border-vault-navy-light px-5 py-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote demo avatar, not part of the Next Image optimization pipeline in this phase */}
      <img
        src={creator.avatarUrl}
        alt=""
        className="h-9 w-9 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{creator.name}</div>
        <div className="text-xs text-slate-400">{creator.role}</div>
      </div>
      <Link
        href="/"
        aria-label="Log out and return to the landing page"
        className="rounded p-1 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        <LogOut size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
