import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { getPayoutConfig } from "@/payouts/payout-config";

export interface CreatorBalanceSummary {
  currency: string;
  pendingAmount: number;
  availableAmount: number;
  paidOutAmount: number;
  /** Hours a fresh credit stays PENDING before it can become AVAILABLE — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md. */
  holdHours: number;
  testMode: boolean;
}

/**
 * The creator's own payable-balance summary for the Payments page — see
 * PLATFORM_FEE_AND_PAYOUT_LEDGER.md. Read-only; a creator has no action
 * here (payout simulation is admin-only, see ADMIN_ARCHITECTURE.md).
 */
export async function getCreatorBalanceSummary(): Promise<CreatorBalanceSummary> {
  const creator = await requireAuthenticatedUser();
  const account = await prisma.creatorBalanceAccount.findUnique({ where: { creatorId: creator.id } });
  const { holdHours, provider } = getPayoutConfig();

  return {
    currency: account?.currency ?? "INR",
    pendingAmount: account ? Number(account.pendingSubunits) / 100 : 0,
    availableAmount: account ? Number(account.availableSubunits) / 100 : 0,
    paidOutAmount: account ? Number(account.paidOutSubunits) / 100 : 0,
    holdHours,
    testMode: provider === "fake",
  };
}
