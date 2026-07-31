import type { Metadata } from "next";
import { getPayments } from "@/data-access/payments";
import { getCreatorBalanceSummary } from "@/data-access/payouts";
import { SectionHeader } from "@/components/ui/section-header";
import { PaymentExplorer } from "@/components/creator/payment-explorer";
import { CreatorBalanceCard } from "@/components/creator/creator-balance-card";
import type { RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Payments",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ payments, summary, hasAnyPayments }, balance] = await Promise.all([
    getPayments(await searchParams),
    getCreatorBalanceSummary(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Payments & Revenue Ledger"
        description="Track payout transactions and pending file-lock funds"
      />
      <CreatorBalanceCard balance={balance} />
      <PaymentExplorer payments={payments} summary={summary} hasAnyPayments={hasAnyPayments} />
    </div>
  );
}
