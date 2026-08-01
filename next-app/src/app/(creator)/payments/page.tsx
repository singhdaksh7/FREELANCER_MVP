import type { Metadata } from "next";
import { getPayments } from "@/data-access/payments";
import { getCreatorBalanceSummary } from "@/data-access/payouts";
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
  const [{ payments, summary, hasAnyPayments }, balance] = await Promise.all([
    getPayments(await searchParams),
    getCreatorBalanceSummary(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-primary-text">Payments</h1>
        <p className="mt-1 text-sm text-secondary-text">Track client payments and project delivery status.</p>
      </div>

      <PaymentExplorer payments={payments} summary={summary} hasAnyPayments={hasAnyPayments} />
    </div>
  );
}
