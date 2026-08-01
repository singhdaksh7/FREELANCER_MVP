import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-primary-navy text-white flex flex-col">
      {/* Read-Only Creator Banner */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-[#16203D] bg-[#0B1224] px-6 py-3 shadow-md">
        <div className="flex items-center gap-2 text-xs font-bold text-warning">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>Preview mode — this is how your client will see the review page.</span>
        </div>
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#16203D] bg-primary-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-hover"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to Workspaces
        </Link>
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
