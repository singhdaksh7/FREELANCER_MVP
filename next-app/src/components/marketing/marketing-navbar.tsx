"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { InlayLogo } from "@/components/brand/inlay-logo";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Security", href: "/#security" },
  { label: "Pricing", href: "/#pricing" },
];

/** Marketing site top navigation bar — matches INLAY Brand Experience System Stitch design. */
export function MarketingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 z-50 w-full border-b border-[#c2c6d7] bg-[#f8f9ff]/95 backdrop-blur-sm"
      aria-label="Site navigation"
    >
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-10">
        {/* Brand */}
        <Link href="/" aria-label="INLAY" className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inlay-primary">
          <InlayLogo size="sm" priority />
          <span className="text-[17px] font-bold tracking-tight text-[#0b1c30]" aria-hidden="true">INLAY</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-[13px] font-medium text-[#5c5f61] transition-colors duration-150 hover:text-[#1C68E7] focus-visible:outline-none focus-visible:underline"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Actions & Mobile menu button */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/login"
            className="hidden text-[13px] font-semibold text-[#1C68E7] transition-colors duration-150 hover:text-[#1555C0] focus-visible:outline-none focus-visible:underline md:block"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#1C68E7] px-5 text-[13px] font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#1555C0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/50 focus-visible:ring-offset-2"
          >
            Get Started
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#5c5f61] hover:bg-[#e5eeff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7] md:hidden"
          >
            {mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-[#c2c6d7] bg-white px-4 pb-6 pt-2 shadow-lg md:hidden">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center text-[15px] font-medium text-[#0b1c30] hover:text-[#1C68E7]"
              >
                {label}
              </Link>
            ))}
            <hr className="my-1 border-[#c2c6d7]" />
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="flex min-h-[44px] items-center font-semibold text-[#1C68E7]"
            >
              Log In
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
