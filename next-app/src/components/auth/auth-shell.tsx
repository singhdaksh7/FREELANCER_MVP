import type { ReactNode } from "react";
import Link from "next/link";
import { Upload, Eye, CheckCircle, Send } from "lucide-react";
import { InlayLogo } from "@/components/brand/inlay-logo";

interface AuthShellProps {
  children: ReactNode;
  /** Tagline displayed on the left branding panel. */
  tagline?: string;
}

const WORKFLOW_STEPS = [
  { icon: Upload, label: "Upload" },
  { icon: Eye, label: "Review" },
  { icon: CheckCircle, label: "Approve" },
  { icon: Send, label: "Deliver" },
] as const;

/**
 * Split-layout auth shell matching the Stitch "INLAY Brand Experience System" design.
 *
 * Desktop: left branding panel (bg-[#eff4ff]) + right form panel (bg-white).
 * Mobile: full-width form panel only, logo shown above the form.
 */
export function AuthShell({ children, tagline }: AuthShellProps) {
  return (
    <div className="flex min-h-screen w-full bg-white">
      {/* ── Left branding panel (desktop only) ── */}
      <div className="relative hidden flex-col justify-between border-r border-[#c2c6d7] bg-[#eff4ff] p-10 md:flex md:w-1/2 lg:p-14">
        {/* Top logo */}
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inlay-primary rounded-md"
          aria-label="INLAY home"
        >
          <InlayLogo size="sm" priority />
          <span className="text-[17px] font-bold tracking-tight text-[#0b1c30]">INLAY</span>
        </Link>

        {/* Middle content */}
        <div className="my-auto max-w-md">
          <h2 className="mb-8 text-[26px] font-bold leading-[1.25] tracking-[-0.015em] text-[#0b1c30] lg:text-[30px]">
            {tagline ?? "A professional client experience, from first review to final delivery."}
          </h2>

          {/* Workflow steps */}
          <div className="flex items-center gap-4">
            {WORKFLOW_STEPS.map(({ icon: Icon, label }, index) => (
              <div key={label} className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#c2c6d7] bg-white/70">
                    <Icon size={20} className="text-[#1C68E7]" aria-hidden="true" />
                  </div>
                  <span className="text-[11px] font-semibold text-[#5c5f61]">{label}</span>
                </div>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <div className="mb-5 h-px w-6 shrink-0 bg-[#c2c6d7]" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom copy */}
        <p className="text-[12px] text-[#5c5f61]">© {new Date().getFullYear()} INLAY. Professional content delivery.</p>

        {/* Decorative gradient blob */}
        <div
          className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-[#1C68E7]/10 blur-3xl"
          aria-hidden="true"
        />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex w-full flex-col justify-center bg-white px-6 py-12 md:w-1/2 lg:px-20">
        {/* Mobile logo (hidden on md+) */}
        <div className="mb-8 flex items-center gap-2 md:hidden">
          <Link href="/" aria-label="INLAY home">
            <InlayLogo size="sm" priority />
          </Link>
          <span className="text-[17px] font-bold tracking-tight text-[#0b1c30]">INLAY</span>
        </div>

        <div className="mx-auto w-full max-w-[440px]">
          {children}
        </div>
      </div>
    </div>
  );
}
