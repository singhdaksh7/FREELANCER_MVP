import type { Metadata } from "next";
import { ArrowRight, FileText, Lock, ShieldCheck, Zap } from "lucide-react";
import { PublicNav } from "@/components/layout/public-nav";
import { PublicFooter } from "@/components/layout/public-footer";
import { LinkButton } from "@/components/ui/link-button";
import { BRAND } from "@/lib/branding";

export const metadata: Metadata = {
  title: `${BRAND.productName} — Payment-Gated Delivery for Creators`,
};

const FEATURES = [
  {
    icon: Lock,
    title: "Dynamic Watermarking",
    description:
      "Personalised overlay watermarks stamped across high-res client previews to prevent unreleased usage.",
  },
  {
    icon: Zap,
    title: "Automated File Unlock",
    description:
      "Clients pay ₹25,000 via UPI/Card and immediately unlock original clean vector, zip, and raw assets.",
  },
  {
    icon: FileText,
    title: "Version Control & Feedback",
    description:
      "Pin comments directly onto files, request version revisions, and keep proof of approval log.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-vault-navy text-white">
      <PublicNav />

      <section className="mx-auto max-w-[900px] px-6 pb-15 pt-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-vault-navy-light px-4 py-1.5 text-[13px] font-semibold text-vault-blue">
          <ShieldCheck size={16} aria-hidden="true" />
          Payment-Gated Delivery Platform for Creators
        </div>
        <h1 className="mb-6 text-[56px] font-extrabold leading-[1.1] tracking-tight">
          Never Get Ghosted Before Getting Paid Again
        </h1>
        <p className="mb-9 text-lg leading-relaxed text-slate-400">
          Share watermarked work previews securely with clients. Automatically
          lock original download files until full payment is completed
          through simulated payment-gated delivery.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <LinkButton href="/dashboard" size="lg">
            Explore Creator Dashboard Prototype{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </LinkButton>
          <LinkButton
            href="/review/sec_tok_brand_identity_99"
            size="lg"
            className="border border-white/10 bg-vault-navy-light text-white hover:bg-vault-navy-light"
          >
            Try Live Client Review Demo
          </LinkButton>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 px-6 py-15 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-lg border border-white/5 bg-vault-navy-light p-8"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-vault-blue/20">
              <Icon size={24} color="#2563EB" aria-hidden="true" />
            </div>
            <h3 className="mb-3 text-xl font-bold">{title}</h3>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
        ))}
      </section>

      <PublicFooter />
    </div>
  );
}
