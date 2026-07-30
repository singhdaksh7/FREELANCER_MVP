import { LogOut } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import type { AuthenticatedCreator } from "@/data-access/auth";

export interface CreatorProfileProps {
  creator: AuthenticatedCreator;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "?";
}

/**
 * Sidebar footer identity block, now backed by the authenticated session
 * (see src/data-access/auth.ts) instead of hardcoded mock data. Logout
 * submits a real Server Action that ends the Auth.js session server-side
 * — it is a `<form>`, not a link, so it can never be triggered by mere
 * client-side navigation/prefetch.
 */
export function CreatorProfile({ creator }: CreatorProfileProps) {
  return (
    <div className="flex items-center gap-3 border-t border-vault-navy-light px-5 py-4">
      {creator.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote demo avatar, not part of the Next Image optimization pipeline in this phase
        <img src={creator.image} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vault-blue text-xs font-bold text-white"
        >
          {getInitials(creator.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{creator.name}</div>
        <div className="truncate text-xs text-slate-400">{creator.email}</div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Log out"
          title="Log out"
          className="rounded p-1 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
