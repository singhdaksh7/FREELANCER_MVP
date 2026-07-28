import type { Metadata } from "next";
import { PAYMENTS } from "@/data/mock";
import { SectionHeader } from "@/components/ui/section-header";
import { PaymentExplorer } from "@/components/creator/payment-explorer";

export const metadata: Metadata = {
  title: "Payments",
};

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Payments & Revenue Ledger"
        description="Track payout transactions, platform fees, and pending file-lock funds"
      />
      <PaymentExplorer payments={PAYMENTS} />
    </div>
  );
}
