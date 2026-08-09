import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit coverage for `getClientPaymentStatus`'s mode-agnostic
 * DownloadGrant/DeliveryBundle lookup — see the Part 5/6 incident fix:
 * this function used to only ever check `downloadReady`/`deliveryFailed`
 * when a `Payment` row existed, which meant an APPROVAL_ONLY workspace
 * (which never has one) could reach FILES_UNLOCKED with a real
 * DownloadGrant already sitting in the database and this endpoint would
 * still report `downloadReady: false` forever, so the client's
 * "Download Approved Files" UI could never appear.
 */
const prismaMock = {
  workspace: { findUniqueOrThrow: vi.fn() },
  payment: { findFirst: vi.fn() },
  downloadGrant: { findUnique: vi.fn(), findFirst: vi.fn() },
  deliveryBundle: { findUnique: vi.fn(), findFirst: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const ensureApprovedDeliveryEnqueued = vi.fn();
vi.mock("./delivery-release", () => ({ ensureApprovedDeliveryEnqueued }));

const CONTEXT = { workspaceId: "ws_1" } as unknown as import("./review-auth").ReviewContext;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.payment.findFirst.mockResolvedValue(null);
  ensureApprovedDeliveryEnqueued.mockResolvedValue(undefined);
});

describe("getClientPaymentStatus — approval-only (no Payment row)", () => {
  it("reports downloadReady:true once FILES_UNLOCKED, looked up by workspaceId when there is no payment", async () => {
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "FILES_UNLOCKED" });
    prismaMock.downloadGrant.findFirst.mockResolvedValue({ id: "grant_1" });

    const { getClientPaymentStatus } = await import("./payment-orders");
    const status = await getClientPaymentStatus(CONTEXT);

    expect(status.downloadReady).toBe(true);
    expect(status.paymentId).toBeNull();
    expect(prismaMock.downloadGrant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws_1" } }),
    );
    expect(prismaMock.downloadGrant.findUnique).not.toHaveBeenCalled();
  });

  it("reports downloadReady:false while still AWAITING_CREATOR_RELEASE, even if a grant somehow existed", async () => {
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "AWAITING_CREATOR_RELEASE" });

    const { getClientPaymentStatus } = await import("./payment-orders");
    const status = await getClientPaymentStatus(CONTEXT);

    expect(status.downloadReady).toBe(false);
    expect(prismaMock.downloadGrant.findFirst).not.toHaveBeenCalled();
  });

  it("PHASE 8 recovery — no bundle exists yet while AWAITING_CREATOR_RELEASE, so it opportunistically re-attempts the idempotent auto-delivery trigger", async () => {
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "AWAITING_CREATOR_RELEASE" });
    prismaMock.deliveryBundle.findFirst.mockResolvedValue(null);

    const { getClientPaymentStatus } = await import("./payment-orders");
    await getClientPaymentStatus(CONTEXT);

    expect(ensureApprovedDeliveryEnqueued).toHaveBeenCalledWith("ws_1");
  });

  it("PHASE 8 recovery — never lets a retry failure bubble up to the client status response", async () => {
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "AWAITING_CREATOR_RELEASE" });
    prismaMock.deliveryBundle.findFirst.mockResolvedValue(null);
    ensureApprovedDeliveryEnqueued.mockRejectedValue(new Error("transient DB error"));

    const { getClientPaymentStatus } = await import("./payment-orders");
    await expect(getClientPaymentStatus(CONTEXT)).resolves.toEqual(
      expect.objectContaining({ workspaceStatus: "AWAITING_CREATOR_RELEASE" }),
    );
  });

  it("reports deliveryFailed:true when the approval-only delivery bundle failed, looked up by workspaceId", async () => {
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "AWAITING_CREATOR_RELEASE" });
    prismaMock.deliveryBundle.findFirst.mockResolvedValue({ status: "FAILED" });

    const { getClientPaymentStatus } = await import("./payment-orders");
    const status = await getClientPaymentStatus(CONTEXT);

    // AWAITING_CREATOR_RELEASE is the approval-only equivalent of PAID's
    // "delivery is being prepared" window (see PART 5 gating), so it's
    // included in the same deliveryFailed check as PAID.
    expect(status.deliveryFailed).toBe(true);
  });
});

describe("getClientPaymentStatus — payment-required (unchanged behavior)", () => {
  it("still looks up the grant by paymentId when a Payment row exists", async () => {
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "FILES_UNLOCKED" });
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay_1", status: "PAID" });
    prismaMock.downloadGrant.findUnique.mockResolvedValue({ id: "grant_1" });

    const { getClientPaymentStatus } = await import("./payment-orders");
    const status = await getClientPaymentStatus(CONTEXT);

    expect(status.downloadReady).toBe(true);
    expect(prismaMock.downloadGrant.findUnique).toHaveBeenCalledWith({
      where: { paymentId: "pay_1" },
      select: { id: true },
    });
    expect(prismaMock.downloadGrant.findFirst).not.toHaveBeenCalled();
  });
});
