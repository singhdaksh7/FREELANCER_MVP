import "server-only";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/data-access/activity";
import { ActivityAction } from "@/lib/activity-log";
import { InvalidPayoutTransitionError } from "./payout-errors";
import type { PayoutProvider } from "./payout-provider";

/**
 * Deterministic, database-only payout simulation — see
 * PLATFORM_FEE_AND_PAYOUT_LEDGER.md "Test-mode payout limitation." Every
 * method is idempotent (repeating a call that already landed is a no-op,
 * never a duplicate balance movement) and only ever moves a
 * PayoutLedgerEntry forward through PENDING -> AVAILABLE -> PROCESSING ->
 * PAID (or -> FAILED from PROCESSING) — never backward, and never touches
 * Payment or DownloadGrant rows at all.
 */

async function loadEntry(entryId: string) {
  const entry = await prisma.payoutLedgerEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new InvalidPayoutTransitionError("Ledger entry not found.");
  return entry;
}

async function markAvailable(entryId: string): Promise<void> {
  const entry = await loadEntry(entryId);
  if (entry.status === "AVAILABLE" || entry.status === "PROCESSING" || entry.status === "PAID") return; // idempotent
  if (entry.status !== "PENDING") {
    throw new InvalidPayoutTransitionError(`Cannot mark a ${entry.status} ledger entry as available.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutLedgerEntry.update({ where: { id: entryId }, data: { status: "AVAILABLE" } });
    await tx.creatorBalanceAccount.update({
      where: { creatorId: entry.creatorId },
      data: { pendingSubunits: { decrement: entry.amountSubunits }, availableSubunits: { increment: entry.amountSubunits } },
    });
    await recordActivity(tx, {
      action: ActivityAction.PAYOUT_AVAILABLE,
      actorType: "SYSTEM",
      actorName: "Test Payout Simulation",
      creatorId: entry.creatorId,
      metadata: { payoutStatus: "AVAILABLE" },
    });
  });
}

async function startPayout(entryId: string): Promise<void> {
  const entry = await loadEntry(entryId);
  if (entry.status === "PROCESSING" || entry.status === "PAID") return; // idempotent
  // AVAILABLE (first attempt) or FAILED (retry) can both start processing —
  // the amount was never moved out of availableSubunits by a failed
  // attempt (see failPayout), so it's still there to retry from.
  if (entry.status !== "AVAILABLE" && entry.status !== "FAILED") {
    throw new InvalidPayoutTransitionError(`Cannot start a payout for a ${entry.status} ledger entry.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutLedgerEntry.update({ where: { id: entryId }, data: { status: "PROCESSING" } });
    await recordActivity(tx, {
      action: ActivityAction.PAYOUT_PROCESSING,
      actorType: "SYSTEM",
      actorName: "Test Payout Simulation",
      creatorId: entry.creatorId,
      metadata: { payoutStatus: "PROCESSING" },
    });
  });
}

async function completePayout(entryId: string): Promise<void> {
  const entry = await loadEntry(entryId);
  if (entry.status === "PAID") return; // idempotent
  if (entry.status !== "PROCESSING") {
    throw new InvalidPayoutTransitionError(`Cannot complete a payout for a ${entry.status} ledger entry.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutLedgerEntry.update({ where: { id: entryId }, data: { status: "PAID" } });
    await tx.creatorBalanceAccount.update({
      where: { creatorId: entry.creatorId },
      data: { availableSubunits: { decrement: entry.amountSubunits }, paidOutSubunits: { increment: entry.amountSubunits } },
    });
    await recordActivity(tx, {
      action: ActivityAction.PAYOUT_COMPLETED,
      actorType: "SYSTEM",
      actorName: "Test Payout Simulation",
      creatorId: entry.creatorId,
      metadata: { payoutStatus: "PAID" },
    });
  });
}

async function failPayout(entryId: string, reason: string): Promise<void> {
  const entry = await loadEntry(entryId);
  if (entry.status === "FAILED") return; // idempotent
  if (entry.status !== "PROCESSING") {
    throw new InvalidPayoutTransitionError(`Cannot fail a ${entry.status} ledger entry.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payoutLedgerEntry.update({
      where: { id: entryId },
      data: { status: "FAILED", metadata: { failureReason: reason.slice(0, 500) } },
    });
    // No balance adjustment: startPayout never moved this amount out of
    // availableSubunits (only completePayout does, on success), so it's
    // already sitting there, untouched, ready for a retry via startPayout.
    await recordActivity(tx, {
      action: ActivityAction.PAYOUT_FAILED,
      actorType: "SYSTEM",
      actorName: "Test Payout Simulation",
      creatorId: entry.creatorId,
      metadata: { payoutStatus: "FAILED" },
    });
  });
}

export const fakePayoutProvider: PayoutProvider = {
  name: "fake",
  markAvailable,
  startPayout,
  completePayout,
  failPayout,
};
