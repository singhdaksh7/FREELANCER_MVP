import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Final CTA section — bottom of homepage. */
export function FinalCtaSection() {
  return (
    <section
      className="border-t border-[#c2c6d7] bg-[#f8f9ff] py-20 lg:py-28"
      aria-labelledby="final-cta-heading"
    >
      <div className="mx-auto max-w-[700px] px-4 text-center sm:px-6">
        <h2
          id="final-cta-heading"
          className="mb-5 text-[30px] font-bold tracking-[-0.015em] text-[#0b1c30] sm:text-[38px]"
        >
          Start delivering professional work today
        </h2>
        <p className="mb-9 text-[15px] leading-relaxed text-[#424654]">
          Join creators who use INLAY to share work confidently, get approvals
          faster, and never lose a file to an unpaid invoice again.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-lg bg-[#1C68E7] px-8 text-[14px] font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#1555C0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C68E7]/40 focus-visible:ring-offset-2"
          >
            Get Started Free
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/login"
            className="text-[14px] font-semibold text-[#1C68E7] transition-colors duration-150 hover:text-[#1555C0] focus-visible:outline-none focus-visible:underline"
          >
            Already have an account? Log In
          </Link>
        </div>
      </div>
    </section>
  );
}
