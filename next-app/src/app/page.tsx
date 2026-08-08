import type { Metadata } from "next";
import { BRAND } from "@/lib/branding";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { SecuritySection } from "@/components/marketing/security-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: `${BRAND.productName} — Secure Review & Delivery for Creators`,
  description:
    "Upload your work, share watermarked previews, collect client approvals, and release original files securely. The professional creative delivery platform.",
};

/** Public marketing homepage — INLAY Brand Experience System Stitch design. */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#0b1c30]">
      <MarketingNavbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <SecuritySection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
