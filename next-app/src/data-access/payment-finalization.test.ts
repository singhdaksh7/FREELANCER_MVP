import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the central payment-finalization service
 * — see PAYMENT_ARCHITECTURE.md "Idempotency." Integration coverage
 * (real database, both webhook and reconciliation call sites, plus the
 * full auto-delivery round trip) lives in
 * src/data-access/payment-workflow.integration.test.ts.
 *
 * ensureApprovedDeliveryEnqueued (src/data-access/delivery-release.ts) is
 * mocked here — its own eligibility/idempotency logic is covered by
 * delivery-release.test.ts. These tests only verify finalizeCapturedPayment
 * calls it (or doesn't) at the right times, and that a failure from it
 * never fails the payment itself. See the "NEW PRODUCT RULE" removing the
 * manual freelancer-release step.
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
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const ensureApprovedDeliveryEnqueued = vi.fn();
vi.mock("./delivery-release", () => ({ ensureApprovedDeliveryEnqueued }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  ensureApprovedDeliveryEnqueued.mockResolvedValue(undefined);
});

describe("finalizeCapturedPayment", () => {
  it("returns alreadyFinalized without any writes when the payment is already PAID, but still re-attempts auto-delivery (recovery path)", async () => {
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
    expect(ensureApprovedDeliveryEnqueued).toHaveBeenCalledWith("ws_1");
  });

  it("throws UnknownOrderError for a gatewayOrderId with no local Payment row, and never triggers delivery", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { UnknownOrderError } = await import("@/payments/payment-errors");
    prismaMock.payment.findUnique.mockResolvedValue(null);

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_unknown", gatewayPaymentId: "pay_1", amountSubunits: BigInt(1), currency: "INR" }),
    ).rejects.toBeInstanceOf(UnknownOrderError);
    expect(ensureApprovedDeliveryEnqueued).not.toHaveBeenCalled();
  });

  it("rejects an amount mismatch and never marks the payment PAID or triggers delivery", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { AmountMismatchError } = await import("@/payments/payment-errors");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT });

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_gw_1", amountSubunits: BigInt(1), currency: "INR" }),
    ).rejects.toBeInstanceOf(AmountMismatchError);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
    expect(ensureApprovedDeliveryEnqueued).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch and never marks the payment PAID or triggers delivery", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    const { CurrencyMismatchError } = await import("@/payments/payment-errors");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT });

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_gw_1", amountSubunits: BigInt(50000), currency: "USD" }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
    expect(ensureApprovedDeliveryEnqueued).not.toHaveBeenCalled();
  });

  it("throws WorkspaceNotPayableError when the workspace isn't PAYMENT_PENDING or already paid, and never triggers delivery", async () => {
    const { finalizeCapturedPayment, WorkspaceNotPayableError } = await import("./payment-finalization");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT, workspace: { id: "ws_1", status: "APPROVED" } });

    await expect(
      finalizeCapturedPayment({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_gw_1", amountSubunits: BigInt(50000), currency: "INR" }),
    ).rejects.toBeInstanceOf(WorkspaceNotPayableError);
    expect(ensureApprovedDeliveryEnqueued).not.toHaveBeenCalled();
  });

  it("on success: marks Payment PAID, moves the workspace to the transient AWAITING_CREATOR_RELEASE status, and automatically triggers delivery — no manual creator action", async () => {
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
      expect.objectContaining({ where: { id: "ws_1" }, data: expect.objectContaining({ status: "AWAITING_CREATOR_RELEASE" }) }),
    );
    expect(ensureApprovedDeliveryEnqueued).toHaveBeenCalledWith("ws_1");
  });

  it("never fails the payment when auto-delivery enqueue throws — payment stays PAID and finalizeCapturedPayment still resolves", async () => {
    const { finalizeCapturedPayment } = await import("./payment-finalization");
    prismaMock.payment.findUnique.mockResolvedValue({ ...BASE_PAYMENT });
    prismaMock.payment.update.mockResolvedValue({ ...BASE_PAYMENT, status: "PAID" });
    ensureApprovedDeliveryEnqueued.mockRejectedValue(new Error("transient DB error"));

    const result = await finalizeCapturedPayment({
      gatewayOrderId: "order_1",
      gatewayPaymentId: "pay_gw_1",
      amountSubunits: BigInt(50000),
      currency: "INR",
    });

    expect(result.alreadyFinalized).toBe(false);
    expect(result.paymentId).toBe("pay_1");
  });
});
