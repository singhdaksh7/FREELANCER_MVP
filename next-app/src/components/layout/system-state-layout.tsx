import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { InlayLogo } from "@/components/brand/inlay-logo";

export interface SystemStateLayoutProps {
  code: string;
  title: string;
  message: string;
  icon: LucideIcon;
  /**
   * Overrides the default "Return to Creator Dashboard" / "Home Landing"
   * buttons — used by the client review portal's system states
   * (invalid/expired/revoked token, etc.), which must never link a client
   * (no creator account) into `/dashboard`.
   */
  actions?: ReactNode;
}

/**
 * Full-screen system/error state shell (link expired, revoked, 403, 500,
 * and Next.js not-found/error boundaries). Ported from the original
 * SystemStatePage in AdminAndSystemPages.jsx.
 */
export function SystemStateLayout({
  code,
  title,
  message,
  icon: Icon,
  actions,
}: SystemStateLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-vault-navy p-6 text-white">
      <div className="max-w-[480px] rounded-lg border border-white/10 bg-vault-navy-light p-10 text-center">
        <div className="mb-6 flex justify-center">
          <InlayLogo size="sm" container />
        </div>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
          <Icon size={28} color="#EF4444" aria-hidden="true" />
        </div>
        <p className="text-sm font-extrabold uppercase tracking-wide text-vault-blue">
          System State [{code}]
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {message}
        </p>

        <div className="mt-7 flex justify-center gap-3">
          {actions ?? (
            <>
              <LinkButton href="/dashboard">Return to Creator Dashboard</LinkButton>
              <LinkButton
                href="/"
                variant="ghost"
                className="border border-white/20 text-slate-400"
              >
                Home Landing
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
