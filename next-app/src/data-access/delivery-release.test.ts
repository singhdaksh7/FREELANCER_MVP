import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the auto-delivery trigger
 * (ensureApprovedDeliveryEnqueued) and its legacy/internal wrapper
 * (releaseApprovedFiles — no longer reachable from any UI, kept for
 * backward compatibility). Integration equivalent (real database, full
 * approve/pay -> auto-delivery -> worker -> download round trip) lives in
 * delivery-modes.integration.test.ts.
 */

const prismaMock = {
  workspace: { findUnique: vi.fn() },
  workspaceApproval: { findFirst: vi.fn() },
  changeRequest: { findFirst: vi.fn() },
  payment: { findFirst: vi.fn() },
  deliveryBundle: { findUnique: vi.fn(), create: vi.fn() },
  deliveryBundleJob: { create: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const FAKE_CREATOR = { id: "usr_1", name: "Arjun Raj" };

vi.mock("./authorization", () => ({
  requireOwnedWorkspace: vi.fn(),
}));

vi.mock("@/lib/worker-wake", () => ({
  wakeWorker: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  prismaMock.changeRequest.findFirst.mockResolvedValue(null);
});

async function mockOwnedWorkspace(overrides: Partial<Record<string, unknown>> = {}) {
  const { requireOwnedWorkspace } = await import("./authorization");
  const workspace = {
    id: "ws_1",
    creatorId: FAKE_CREATOR.id,
    deliveryMode: "APPROVAL_ONLY",
    status: "AWAITING_CREATOR_RELEASE",
    ...overrides,
  };
  vi.mocked(requireOwnedWorkspace).mockResolvedValue({ creator: FAKE_CREATOR, workspace } as never);
  prismaMock.workspace.findUnique.mockResolvedValue(workspace);
}

describe("ensureApprovedDeliveryEnqueued — eligibility (safe no-op, never throws)", () => {
  it("does nothing for a nonexistent workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(null);
    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_missing");
    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
  });

  it("does nothing when no APPROVED WorkspaceApproval snapshot exists", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "APPROVAL_ONLY" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_1");
    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
  });

  it("does nothing when an open ChangeRequest exists", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "APPROVAL_ONLY" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_1" });
    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_1");
    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
  });

  it("does nothing for PAYMENT_REQUIRED before a captured payment exists", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.payment.findFirst.mockResolvedValue(null);
    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_1");
    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
  });
});

describe("ensureApprovedDeliveryEnqueued — success and idempotency", () => {
  it("creates exactly one DeliveryBundle + DeliveryBundleJob for APPROVAL_ONLY (no Payment, no gateway order)", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "APPROVAL_ONLY" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.deliveryBundle.findUnique.mockResolvedValue(null);
    prismaMock.deliveryBundle.create.mockResolvedValue({ id: "bundle_1" });

    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_1");

    expect(prismaMock.deliveryBundle.create).toHaveBeenCalledTimes(1);
    const bundleData = prismaMock.deliveryBundle.create.mock.calls[0][0].data;
    expect(bundleData.paymentId).toBeNull();
    expect(bundleData.approvalId).toBe("appr_1");
    expect(prismaMock.deliveryBundleJob.create).toHaveBeenCalledTimes(1);

    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(expect.arrayContaining(["DELIVERY_PREPARATION_STARTED"]));

    const { wakeWorker } = await import("@/lib/worker-wake");
    expect(wakeWorker).toHaveBeenCalledWith("delivery");
  });

  it("creates the delivery bundle only after a captured PAYMENT_REQUIRED payment", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay_1" });
    prismaMock.deliveryBundle.findUnique.mockResolvedValue(null);

    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_1");

    expect(prismaMock.deliveryBundle.create.mock.calls[0][0].data.paymentId).toBe("pay_1");
  });

  it("is idempotent — a no-op when a DeliveryBundle already exists for this approval", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "APPROVAL_ONLY" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.deliveryBundle.findUnique.mockResolvedValue({ id: "bundle_existing" });

    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await ensureApprovedDeliveryEnqueued("ws_1");

    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("swallows a P2002 unique-constraint race on approvalId as an idempotent no-op — never a second bundle", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue({ id: "ws_1", creatorId: "usr_1", deliveryMode: "APPROVAL_ONLY" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.deliveryBundle.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });

    const { ensureApprovedDeliveryEnqueued } = await import("./delivery-release");
    await expect(ensureApprovedDeliveryEnqueued("ws_1")).resolves.toBeUndefined();

    const { wakeWorker } = await import("@/lib/worker-wake");
    expect(wakeWorker).not.toHaveBeenCalled();
  });
});

describe("releaseApprovedFiles — legacy/internal wrapper", () => {
  it("refuses a PAYMENT_REQUIRED workspace before a captured payment exists", async () => {
    await mockOwnedWorkspace({ deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.payment.findFirst.mockResolvedValue(null);
    const { releaseApprovedFiles, WorkspaceNotReleasableError } = await import("./delivery-release");
    await expect(releaseApprovedFiles("ws_1")).rejects.toBeInstanceOf(WorkspaceNotReleasableError);
  });

  it("refuses a workspace that isn't AWAITING_CREATOR_RELEASE", async () => {
    await mockOwnedWorkspace({ status: "APPROVED" });
    const { releaseApprovedFiles, WorkspaceNotReleasableError } = await import("./delivery-release");
    await expect(releaseApprovedFiles("ws_1")).rejects.toBeInstanceOf(WorkspaceNotReleasableError);
  });

  it("refuses when no APPROVED WorkspaceApproval snapshot exists", async () => {
    await mockOwnedWorkspace();
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    const { releaseApprovedFiles, NoApprovalFoundError } = await import("./delivery-release");
    await expect(releaseApprovedFiles("ws_1")).rejects.toBeInstanceOf(NoApprovalFoundError);
  });

  it("delegates to the same idempotent core once eligible", async () => {
    await mockOwnedWorkspace();
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.deliveryBundle.findUnique.mockResolvedValue(null);
    prismaMock.deliveryBundle.create.mockResolvedValue({ id: "bundle_1" });

    const { releaseApprovedFiles } = await import("./delivery-release");
    await releaseApprovedFiles("ws_1");

    expect(prismaMock.deliveryBundle.create).toHaveBeenCalledTimes(1);
  });
});
