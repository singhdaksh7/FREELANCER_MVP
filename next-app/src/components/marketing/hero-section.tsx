import Link from "next/link";
import { ShieldCheck, Eye, Send, CheckCircle } from "lucide-react";

/** Hero section — matches Stitch INLAY Homepage Desktop/Mobile design. */
export function HeroSection() {
  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col items-center px-4 pb-16 pt-[120px] text-center sm:px-6 lg:px-10 lg:pb-24">
      {/* Badge */}
      <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-[#c2c6d7] bg-[#eff4ff] px-3.5 py-1 text-[12px] font-semibold tracking-wide text-[#1C68E7]">
        <ShieldCheck size={13} aria-hidden="true" />
        Secure Creative Delivery Platform
      </div>

      {/* Headline */}
      <h1 className="mb-5 max-w-[800px] text-[40px] font-bold leading-[1.15] tracking-[-0.02em] text-[#0b1c30] sm:text-[52px] lg:text-[60px]">
        Secure file delivery. <span className="text-[#1C68E7]">Guaranteed payments.</span>
      </h1>

      {/* Sub-copy */}
      <p className="mb-9 max-w-[620px] text-[16px] leading-relaxed text-[#424654]">
        Upload work, collect feedback, and unlock final files automatically the moment payment clears.
      </p>

      {/* CTAs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Link
          href="/register"
          className="inline-flex h-[52px] items-center justify-center rounded-lg bg-[#1C68E7] px-8 text-[14px] font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#1555C0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 focus-visible:ring-offset-2"
        >
          Get Started — It&apos;s Free
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex h-[52px] items-center justify-center rounded-lg border border-[#c2c6d7] bg-white px-8 text-[14px] font-semibold text-[#0b1c30] shadow-sm transition-colors duration-150 hover:bg-[#f8f9ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 focus-visible:ring-offset-2"
        >
          See How It Works
        </a>
      </div>

      {/* Product mockup */}
      <div className="mt-14 w-full max-w-[900px] overflow-hidden rounded-2xl border border-[#c2c6d7] bg-white shadow-[0_10px_60px_-15px_rgba(28,104,231,0.12)]">
        {/* Mockup browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-[#e5eeff] bg-[#f8f9ff] px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-[#fca5a5]" aria-hidden="true" />
          <div className="h-3 w-3 rounded-full bg-[#fcd34d]" aria-hidden="true" />
          <div className="h-3 w-3 rounded-full bg-[#6ee7b7]" aria-hidden="true" />
          <div className="ml-3 flex-1 rounded-md border border-[#c2c6d7] bg-white px-3 py-1 text-center text-[11px] text-[#5c5f61]">
            inlay.app/review/••••••••
          </div>
        </div>

        {/* Mockup content — static preview of the review portal */}
        <div className="grid grid-cols-1 divide-x divide-[#e5eeff] md:grid-cols-[1fr_300px]">
          {/* Left — file preview */}
          <div className="flex min-h-[320px] flex-col items-center justify-center bg-[#f8f9ff] p-8">
            <div className="relative mb-4 aspect-[4/3] w-full max-w-[360px] overflow-hidden rounded-xl border border-[#c2c6d7] bg-[#e5eeff]">
              {/* Simulated watermarked preview */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="h-20 w-32 rounded-lg bg-[#d3e4fe]" aria-hidden="true" />
                <div className="h-3 w-24 rounded bg-[#c2c6d7]" aria-hidden="true" />
                <div className="h-3 w-16 rounded bg-[#c2c6d7]" aria-hidden="true" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rotate-[-30deg] select-none text-[11px] font-bold uppercase tracking-widest text-[#1C68E7]/15">
                  INLAY PROTECTED PREVIEW
                </span>
              </div>
            </div>
            <p className="text-[12px] text-[#5c5f61]">Brand Identity Package — v3</p>
          </div>

          {/* Right — review panel */}
          <div className="flex flex-col gap-4 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#5c5f61]">Client Review</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[#0b1c30]">Brand Identity</h3>
              <p className="text-[12px] text-[#5c5f61]">Acme Studio · Ready for Review</p>
            </div>

            {/* Comment */}
            <div className="rounded-lg border border-[#e5eeff] bg-[#f8f9ff] p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#1C68E7]/20 text-center text-[10px] leading-6 font-bold text-[#1C68E7]">
                  R
                </div>
                <span className="text-[11px] font-semibold text-[#0b1c30]">Rohit S.</span>
              </div>
              <p className="text-[11px] text-[#424654]">
                Can we make the logo slightly larger on the primary card?
              </p>
            </div>

            {/* Actions */}
            <div className="mt-auto flex flex-col gap-2">
              <button
                type="button"
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1C68E7] px-4 text-[12px] font-semibold text-white"
                aria-label="Approve files (demo)"
              >
                <CheckCircle size={14} aria-hidden="true" />
                Approve Files
              </button>
              <button
                type="button"
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#c2c6d7] bg-white px-4 text-[12px] font-semibold text-[#424654]"
                aria-label="Request changes (demo)"
              >
                Request Changes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Social proof strip */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] text-[#5c5f61]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-[#1C68E7]" aria-hidden="true" />
          Watermarked previews
        </span>
        <span className="hidden h-3.5 w-px bg-[#c2c6d7] sm:block" aria-hidden="true" />
        <span className="flex items-center gap-1.5">
          <Eye size={14} className="text-[#1C68E7]" aria-hidden="true" />
          Controlled access
        </span>
        <span className="hidden h-3.5 w-px bg-[#c2c6d7] sm:block" aria-hidden="true" />
        <span className="flex items-center gap-1.5">
          <Send size={14} className="text-[#1C68E7]" aria-hidden="true" />
          Secure delivery
        </span>
      </div>
    </section>
  );
}
