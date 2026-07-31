import {
  Bell,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface CreatorNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** True for nav items whose destination page isn't built yet in this phase. */
  deferred?: boolean;
}

/**
 * Single source of truth for creator navigation, consumed by both the
 * desktop sidebar and the mobile drawer/bottom nav so the link set can
 * never drift between them. Phase 8 removed Clients (saved-Client CRM
 * retired — see MIGRATION_STATUS.md) and Support (moved into the
 * Settings page's Support section) from this list.
 */
export const CREATOR_NAV_ITEMS: CreatorNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", href: "/workspaces", icon: FolderKanban },
  { id: "payments", label: "Payments", href: "/payments", icon: CreditCard },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: Bell },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

/** With only 5 items left post-Phase-8, the mobile bottom bar now shows every creator nav item, including Settings. */
export const CREATOR_MOBILE_PRIMARY_NAV_ITEMS = CREATOR_NAV_ITEMS.slice(0, 5);
