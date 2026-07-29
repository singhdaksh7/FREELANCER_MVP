import { formatINR } from "@/lib/format-currency";
import type { CreatorBalanceSummary } from "@/data-access/payouts";

/** Freelancer payable-balance summary — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md. Read-only; no action for a creator to take here. */
export function CreatorBalanceCard({ balance }: { balance: CreatorBalanceSummary }) {
  return (
    <div className="rounded-lg border border-line bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Payable Balance</h2>
        {balance.testMode && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Test-mode payout simulation — no real funds are transferred
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-ink-muted">Pending</div>
          <div className="text-lg font-extrabold text-ink">{formatINR(balance.pendingAmount)}</div>
          <div className="text-xs text-ink-muted">Available after {balance.holdHours}h hold</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted">Available</div>
          <div className="text-lg font-extrabold text-success">{formatINR(balance.availableAmount)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted">Paid Out</div>
          <div className="text-lg font-extrabold text-ink">{formatINR(balance.paidOutAmount)}</div>
        </div>
      </div>
    </div>
  );
}
