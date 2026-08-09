import { ShieldCheck, Lock, Eye, FileX } from "lucide-react";

const TRUST_ITEMS = [
  {
    icon: Lock,
    title: "Original files are never exposed",
    description:
      "Clients receive only watermarked preview links. Original assets never leave secure storage until approval (and payment, where required) is confirmed.",
  },
  {
    icon: Eye,
    title: "Every preview is uniquely fingerprinted",
    description:
      "Each review session generates a personalised watermark with client-identifying metadata, deterring unauthorised distribution.",
  },
  {
    icon: FileX,
    title: "Access revocation at any time",
    description:
      "Revoke a review link instantly if a project is cancelled or a client relationship changes. Existing links immediately stop working.",
  },
  {
    icon: ShieldCheck,
    title: "Tamper-evident approval records",
    description:
      "Every approval and revision request is time-stamped and stored. You have a complete, auditable proof-of-approval record.",
  },
] as const;

/** Security section — trust and safety messaging matching Stitch design. */
export function SecuritySection() {
  return (
    <section
      id="security"
      className="border-t border-[#c2c6d7] bg-white py-20 lg:py-28"
      aria-labelledby="security-heading"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          {/* Left — text */}
          <div>
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1C68E7]">
              Security
            </p>
            <h2
              id="security-heading"
              className="mb-5 text-[30px] font-bold tracking-[-0.015em] text-[#0b1c30] sm:text-[36px]"
            >
              Your work stays protected until you&apos;re ready
            </h2>
            <p className="mb-8 text-[15px] leading-relaxed text-[#424654]">
              INLAY is built on the principle that creators should never have to
              choose between sharing their work and protecting it. You maintain
              complete control at every stage.
            </p>
            <div className="flex flex-col gap-5">
              {TRUST_ITEMS.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5eeff] bg-[#eff4ff]">
                    <Icon size={16} className="text-[#1C68E7]" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-[14px] font-semibold text-[#0b1c30]">{title}</h3>
                    <p className="text-[13px] leading-relaxed text-[#5c5f61]">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — visual panel */}
          <div className="rounded-2xl border border-[#c2c6d7] bg-[#f8f9ff] p-6 lg:p-8">
            <div className="mb-5 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1C68E7]">
                <ShieldCheck size={16} className="text-white" aria-hidden="true" />
              </div>
              <span className="text-[14px] font-semibold text-[#0b1c30]">INLAY Delivery Status</span>
            </div>
            {/* Status items */}
            {[
              { label: "Previews shared", value: "Watermarked", ok: true },
              { label: "Original files", value: "Locked", ok: false },
              { label: "Review link", value: "Active", ok: true },
              { label: "Payment", value: "Pending", ok: false },
            ].map(({ label, value, ok }) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-[#e5eeff] py-3 last:border-none"
              >
                <span className="text-[13px] text-[#424654]">{label}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    ok
                      ? "bg-[#eff4ff] text-[#1C68E7]"
                      : "bg-[#e5eeff] text-[#5c5f61]"
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
