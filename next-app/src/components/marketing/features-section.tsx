import { Layers, MessageSquare, GitBranch, Lock } from "lucide-react";

const FEATURES = [
  {
    icon: Lock,
    title: "Dynamic Watermarking",
    description:
      "Personalised overlay watermarks stamped across high-res client previews to prevent unreleased usage. Each preview is uniquely fingerprinted.",
  },
  {
    icon: MessageSquare,
    title: "Pinned Feedback & Approvals",
    description:
      "Clients annotate directly on files. Comments are pinned to specific regions. Formal approvals are time-stamped for dispute resolution.",
  },
  {
    icon: GitBranch,
    title: "Version Control",
    description:
      "Push new file revisions at any time. Clients always see the latest version. Full history is preserved and accessible to you.",
  },
  {
    icon: Layers,
    title: "Payment-Gated Delivery",
    description:
      "Original high-res assets stay locked until payment is confirmed. When payment clears, files are instantly released — no manual intervention.",
  },
] as const;

/** Features section matching Stitch INLAY design system card treatment. */
export function FeaturesSection() {
  return (
    <section
      id="features"
      className="border-t border-[#c2c6d7] bg-[#f8f9ff] py-20 lg:py-28"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        {/* Heading */}
        <div className="mb-14 text-center">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1C68E7]">
            Features
          </p>
          <h2
            id="features-heading"
            className="text-[30px] font-bold tracking-[-0.015em] text-[#0b1c30] sm:text-[36px]"
          >
            Everything you need to protect your work
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-relaxed text-[#424654]">
            Built for freelancers and agencies who need professional-grade delivery
            without enterprise complexity.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-[#c2c6d7] bg-white p-6 transition-shadow duration-200 hover:shadow-[0_4px_20px_-4px_rgba(28,104,231,0.10)]"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[#e5eeff] bg-[#eff4ff]">
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
