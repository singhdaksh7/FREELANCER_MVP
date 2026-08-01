import type { ComponentType } from "react";
import Link from "next/link";
import { Lock, ShieldAlert, Home } from "lucide-react";
import { BRAND } from "@/lib/branding";

export interface ReviewSystemStateProps {
  code: string;
  title: string;
  message: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

export function ReviewSystemState({ code, title, message, icon: Icon }: ReviewSystemStateProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary-navy px-4 text-center text-white">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-[#16203D] bg-deep-navy p-8 shadow-2xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg/20 text-danger">
          <Icon size={28} aria-hidden="true" />
        </div>
        <span className="text-xs font-mono font-bold tracking-widest text-primary-blue uppercase">
          {BRAND.productName} · {code}
        </span>
        <h1 className="text-2xl font-black text-white">{title}</h1>
        <p className="text-sm text-[#98A2B3] leading-relaxed">{message}</p>

        <div className="mt-4 flex w-full flex-col gap-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-md bg-primary-blue px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-hover"
          >
            <Home size={14} aria-hidden="true" /> Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
