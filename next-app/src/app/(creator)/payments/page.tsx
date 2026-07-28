import type { Metadata } from "next";
import { getPayments } from "@/data-access/payments";
import { SectionHeader } from "@/components/ui/section-header";
import { PaymentExplorer } from "@/components/creator/payment-explorer";
import type { RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Payments",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { payments, summary, hasAnyPayments } = await getPayments(await searchParams);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Payments & Revenue Ledger"
        description="Track payout transactions, platform fees, and pending file-lock funds"
      />
      <PaymentExplorer payments={payments} summary={summary} hasAnyPayments={hasAnyPayments} />
    </div>
  );
}
