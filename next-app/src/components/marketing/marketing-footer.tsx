import Link from "next/link";
import { InlayLogo } from "@/components/brand/inlay-logo";

const FOOTER_LINKS = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "Security", href: "/#security" },
  { label: "Contact", href: "#" },
];

/** Marketing footer — matches Stitch INLAY Homepage footer design. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-[#c2c6d7] bg-[#f8f9ff]">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 lg:px-10">
        {/* Brand */}
        <div>
          <Link href="/" className="mb-2 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inlay-primary rounded-md">
            <InlayLogo size="sm" />
            <span className="text-[15px] font-bold text-[#0b1c30]">INLAY</span>
          </Link>
          <p className="text-[12px] text-[#5c5f61]">
            © {new Date().getFullYear()} INLAY. All rights reserved.
          </p>
        </div>

        {/* Links */}
        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="text-[12px] text-[#5c5f61] transition-colors duration-150 hover:text-[#1C68E7] focus-visible:outline-none focus-visible:underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
