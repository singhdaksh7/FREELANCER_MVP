import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the central payment-finalization service
 * — see PAYMENT_ARCHITECTURE.md "Idempotency." Integration coverage
 * (real database, both webhook and reconciliation call sites) lives in
 * src/data-access/payment-workflow.integration.test.ts.
 */

const BASE_PAYMENT = {
  id: "pay_1",
  workspaceId: "ws_1",
  approvalId: "appr_1",
  status: "PENDING",
  amount: { toString: () => "500.00" },
  amountSubunits: BigInt(50000),
  currency: "INR",
  gatewayOrderId: "order_1",
  gatewayPaymentId: null as string | null,
  workspace: { id: "ws_1", status: "PAYMENT_PENDING", deliveryMode: "PAYMENT_REQUIRED" },
};

const prismaMock = {
  payment: { findUnique: vi.fn(), update: vi.fn() },
  workspace: { update: vi.fn() },
  activityLog: { create: vi.fn() },
  deliveryBundle: { create: vi.fn() },
  deliveryBundleJob: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  prismaMock.deliveryBundle.create.mockResolvedValue({ id: "bundle_1" });
});

describe("finalizeCapturedPayment", () => {
  it("returns alreadyFinalized without any writes when the payment is already PAID", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT, status: "PAID" });

    const result = await finalizeCapturedPayment({
      gatewayOrderId: "order_1",
      gatewayPaymentId: "pay_gw_1",
      amountSubunits: BigInt(50000),
      currency: "INR",
    });

    expect(result.alreadyFinalized).toBe(true);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
  });

  it("throws UnknownOrderError for a gatewayOrderId with no local Payment row", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { UnknownOrderError } = await import("@/payments/payment-errors");
    prismaMock.payment.findUnique.mockResolvedValue(null);

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_unknown", gatewayPaymentId: "pay_1", amountSubunits: BigInt(1), currency: "INR" }),
    ).rejects.toBeInstanceOf(UnknownOrderError);
  });

  it("rejects an amount mismatch and never marks the payment PAID", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { AmountMismatchError } = await import("@/payments/payment-errors");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT });

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_gw_1", amountSubunits: BigInt(1), currency: "INR" }),
    ).rejects.toBeInstanceOf(AmountMismatchError);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch and never marks the payment PAID", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { CurrencyMismatchError } = await import("@/payments/payment-errors");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT });

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_gw_1", amountSubunits: BigInt(50000), currency: "USD" }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it("throws WorkspaceNotPayableError when the workspace isn't PAYMENT_PENDING or already paid", async () => {
    const { finalizeCapturedPayment, WorkspaceNotPayableError } = await import("./payment-finalization");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT, workspace: { id: "ws_1", status: "APPROVED" } });

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_gw_1", amountSubunits: BigInt(50000), currency: "INR" }),
    ).rejects.toBeInstanceOf(WorkspaceNotPayableError);
  });

  it("on success: marks Payment PAID, Workspace PAID, and creates exactly one DeliveryBundle + one DeliveryBundleJob", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT });
    prismaMock.payment.update.mockResolvedValue({ ...BASE_PAYMENT, status: "PAID" });

    const result = await finalizeCapturedPayment({
      gatewayOrderId: "order_1",
      gatewayPaymentId: "pay_gw_1",
      amountSubunits: BigInt(50000),
      currency: "INR",
    });

    expect(result.alreadyFinalized).toBe(false);
    expect(prismaMock.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ws_1" }, data: expect.objectContaining({ status: "PAID" }) }),
    );
    expect(prismaMock.deliveryBundle.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.deliveryBundleJob.create).toHaveBeenCalledTimes(1);
  });
});
