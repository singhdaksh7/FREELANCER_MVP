import {
  Bell,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Users,
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
 * never drift between them. Matches the original CreatorLayout.jsx
 * `navItems` order exactly.
 */
export const CREATOR_NAV_ITEMS: CreatorNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", href: "/workspaces", icon: FolderKanban },
  { id: "clients", label: "Clients", href: "/clients", icon: Users },
  { id: "payments", label: "Payments", href: "/payments", icon: CreditCard },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: Bell },
  { id: "support", label: "Support", href: "/support", icon: LifeBuoy },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

/** Bottom bar only ever showed the first 5 items in the original (`navItems.slice(0, 5)`) — Settings was never reachable on mobile. */
export const CREATOR_MOBILE_PRIMARY_NAV_ITEMS = CREATOR_NAV_ITEMS.slice(0, 5);
