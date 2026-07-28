import Link from "next/link";
import { Lock } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";

/** Marketing-site header: brand mark + Sign In / Get Started links. */
export function PublicNav() {
  return (
    <nav className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-12 py-6">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-vault-blue">
          <Lock size={20} color="#FFFFFF" aria-hidden="true" />
        </span>
        <span className="text-xl font-extrabold tracking-tight text-white">
          PROJECT VAULT
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="rounded-md px-2 py-1 text-sm font-semibold text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          Sign In
        </Link>
        <LinkButton href="/register">Get Started Free</LinkButton>
      </div>
    </nav>
  );
}
