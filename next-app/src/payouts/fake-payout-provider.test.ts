import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the deterministic fake payout-simulation
 * provider — see PLATFORM_FEE_AND_PAYOUT_LEDGER.md "Test-mode payout
 * limitation." Integration equivalent (real database, full payment
 * capture -> ledger credit -> simulation round trip) lives in
 * payment-workflow.integration.test.ts / delivery-modes.integration.test.ts.
 */

const prismaMock = {
  payoutLedgerEntry: { findUnique: vi.fn(), update: vi.fn() },
  creatorBalanceAccount: { update: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/activity", () => ({
  recordActivity: vi.fn(async (tx: typeof prismaMock, input: { action: string; creatorId?: string; metadata?: unknown }) => {
    await tx.activityLog.create({ data: input });
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
});

function mockEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entry_1",
    creatorId: "usr_1",
    amountSubunits: BigInt(98000),
    status: "PENDING",
    ...overrides,
  };
}

describe("fakePayoutProvider.markAvailable", () => {
  it("moves PENDING -> AVAILABLE and shifts the balance from pending to available", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry());
    const { fakePayoutProvider } = await import("./fake-payout-provider");

    await fakePayoutProvider.markAvailable("entry_1");

    expect(prismaMock.payoutLedgerEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: { status: "AVAILABLE" },
    });
    expect(prismaMock.creatorBalanceAccount.update).toHaveBeenCalledWith({
      where: { creatorId: "usr_1" },
      data: { pendingSubunits: { decrement: BigInt(98000) }, availableSubunits: { increment: BigInt(98000) } },
    });
  });

  it("is idempotent — already AVAILABLE/PROCESSING/PAID is a no-op", async () => {
    for (const status of ["AVAILABLE", "PROCESSING", "PAID"]) {
      prismaMock.payoutLedgerEntry.update.mockClear();
      prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status }));
      const { fakePayoutProvider } = await import("./fake-payout-provider");
      await fakePayoutProvider.markAvailable("entry_1");
      expect(prismaMock.payoutLedgerEntry.update).not.toHaveBeenCalled();
    }
  });

  it("refuses to mark a FAILED entry available directly", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "FAILED" }));
    const { fakePayoutProvider, } = await import("./fake-payout-provider");
    const { InvalidPayoutTransitionError } = await import("./payout-errors");
    await expect(fakePayoutProvider.markAvailable("entry_1")).rejects.toBeInstanceOf(InvalidPayoutTransitionError);
  });
});

describe("fakePayoutProvider.startPayout", () => {
  it("moves AVAILABLE -> PROCESSING", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "AVAILABLE" }));
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    await fakePayoutProvider.startPayout("entry_1");
    expect(prismaMock.payoutLedgerEntry.update).toHaveBeenCalledWith({ where: { id: "entry_1" }, data: { status: "PROCESSING" } });
  });

  it("allows retrying from FAILED", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "FAILED" }));
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    await fakePayoutProvider.startPayout("entry_1");
    expect(prismaMock.payoutLedgerEntry.update).toHaveBeenCalledWith({ where: { id: "entry_1" }, data: { status: "PROCESSING" } });
  });

  it("refuses to start a still-PENDING entry (must be marked available first)", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "PENDING" }));
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    const { InvalidPayoutTransitionError } = await import("./payout-errors");
    await expect(fakePayoutProvider.startPayout("entry_1")).rejects.toBeInstanceOf(InvalidPayoutTransitionError);
  });
});

describe("fakePayoutProvider.completePayout", () => {
  it("moves PROCESSING -> PAID and shifts the balance from available to paid out", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "PROCESSING" }));
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    await fakePayoutProvider.completePayout("entry_1");
    expect(prismaMock.creatorBalanceAccount.update).toHaveBeenCalledWith({
      where: { creatorId: "usr_1" },
      data: { availableSubunits: { decrement: BigInt(98000) }, paidOutSubunits: { increment: BigInt(98000) } },
    });
  });

  it("never regresses a PAID entry (idempotent)", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "PAID" }));
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    await fakePayoutProvider.completePayout("entry_1");
    expect(prismaMock.payoutLedgerEntry.update).not.toHaveBeenCalled();
    expect(prismaMock.creatorBalanceAccount.update).not.toHaveBeenCalled();
  });
});

describe("fakePayoutProvider.failPayout", () => {
  it("moves PROCESSING -> FAILED without double-counting the balance", async () => {
    prismaMock.payoutLedgerEntry.findUnique.mockResolvedValue(mockEntry({ status: "PROCESSING" }));
    const { fakePayoutProvider } = await import("./fake-payout-provider");
    await fakePayoutProvider.failPayout("entry_1", "simulated");
    expect(prismaMock.payoutLedgerEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: { status: "FAILED", metadata: { failureReason: "simulated" } },
    });
    // No balance-account write at all — the amount never left availableSubunits.
    expect(prismaMock.creatorBalanceAccount.update).not.toHaveBeenCalled();
  });
});
