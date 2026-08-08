import { Upload, Eye, CheckCircle, Send } from "lucide-react";

const STEPS = [
  {
    number: "01",
    icon: Upload,
    title: "Upload Your Work",
    description:
      "Upload final deliverables — logos, videos, brand kits, photography. INLAY stores them securely, out of reach of the client.",
  },
  {
    number: "02",
    icon: Eye,
    title: "Share Protected Previews",
    description:
      "Send clients a unique review link. They see watermarked previews only — no access to original files until you choose to release.",
  },
  {
    number: "03",
    icon: CheckCircle,
    title: "Collect Approvals",
    description:
      "Clients leave pinned comments, request changes, or formally approve. Every action is time-stamped for your records.",
  },
  {
    number: "04",
    icon: Send,
    title: "Release on Your Terms",
    description:
      "Once payment is confirmed and you give the go-ahead, original high-res files are unlocked and delivered instantly.",
  },
] as const;

/** How It Works section — 4-step workflow explanation. */
export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="border-t border-[#c2c6d7] bg-white py-20 lg:py-28"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        {/* Heading */}
        <div className="mb-14 text-center">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1C68E7]">
            How It Works
          </p>
          <h2
            id="how-it-works-heading"
            className="text-[30px] font-bold tracking-[-0.015em] text-[#0b1c30] sm:text-[36px]"
          >
            From upload to delivery in four steps
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-relaxed text-[#424654]">
            INLAY puts you in complete control of when and how clients access your work.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ number, icon: Icon, title, description }) => (
            <div
              key={number}
              className="group relative rounded-2xl border border-[#c2c6d7] bg-[#f8f9ff] p-6 transition-shadow duration-200 hover:shadow-[0_4px_20px_-4px_rgba(28,104,231,0.10)]"
            >
              {/* Step number */}
              <span className="mb-4 block text-[12px] font-semibold tracking-[0.08em] text-[#c2c6d7]">
                {number}
              </span>

              {/* Icon */}
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#e5eeff] bg-[#eff4ff]">
                <Icon size={20} className="text-[#1C68E7]" aria-hidden="true" />
              </div>

              <h3 className="mb-2 text-[15px] font-semibold text-[#0b1c30]">{title}</h3>
              <p className="text-[13px] leading-relaxed text-[#5c5f61]">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
