import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/branding";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/payouts", label: "Payouts" },
] as const;

/**
 * Minimal, professional admin shell — see ADMIN_ARCHITECTURE.md. Kept
 * deliberately separate from CreatorShell: an admin is not "a creator with
 * an extra flag," and this makes the boundary between the two portals
 * structurally obvious rather than something a shared component has to
 * remember to enforce.
 */
export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-vault-navy px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-vault-blue" aria-hidden="true" />
            <span className="text-sm font-bold">{BRAND.adminName}</span>
          </div>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-300">
            {ADMIN_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-slate-400">{adminName}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
