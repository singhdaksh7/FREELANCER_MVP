import type { ReactNode } from "react";
import { requireAdminRole } from "@/data-access/auth";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Definitive admin role gate (layer 2 of 2 — proxy.ts is the fast-path
 * redirect). Every admin data-access function independently re-verifies
 * the ADMIN role too, so this layout is never the only thing standing
 * between an authenticated CREATOR and admin data — see
 * ADMIN_ARCHITECTURE.md.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminRole();
  return <AdminShell adminName={admin.name}>{children}</AdminShell>;
}
