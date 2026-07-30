import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the creator's APPROVAL_ONLY "Release
 * Approved Files" action. Integration equivalent (real database, full
 * approve -> release -> worker -> download round trip) lives in
 * delivery-modes.integration.test.ts.
 */

const prismaMock = {
  workspaceApproval: { findFirst: vi.fn() },
  deliveryBundle: { findFirst: vi.fn(), create: vi.fn() },
  deliveryBundleJob: { create: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const FAKE_CREATOR = { id: "usr_1", name: "Arjun Raj" };

vi.mock("./authorization", () => ({
  requireOwnedWorkspace: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
});

async function mockOwnedWorkspace(overrides: Partial<Record<string, unknown>> = {}) {
  const { requireOwnedWorkspace } = await import("./authorization");
  vi.mocked(requireOwnedWorkspace).mockResolvedValue({
    creator: FAKE_CREATOR,
    workspace: {
      id: "ws_1",
      deliveryMode: "APPROVAL_ONLY",
      status: "AWAITING_CREATOR_RELEASE",
      ...overrides,
    },
  } as never);
}

describe("releaseApprovedFiles — eligibility guards", () => {
  it("refuses a PAYMENT_REQUIRED workspace", async () => {
    await mockOwnedWorkspace({ deliveryMode: "PAYMENT_REQUIRED" });
    const { releaseApprovedFiles, WorkspaceNotReleasableError } = await import("./delivery-release");
    await expect(releaseApprovedFiles("ws_1")).rejects.toBeInstanceOf(WorkspaceNotReleasableError);
  });

  it("refuses an APPROVAL_ONLY workspace that isn't AWAITING_CREATOR_RELEASE", async () => {
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
});

describe("releaseApprovedFiles — success and idempotency", () => {
  it("creates exactly one DeliveryBundle + DeliveryBundleJob (no Payment, no gateway order) and logs FILES_RELEASED", async () => {
    await mockOwnedWorkspace();
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.deliveryBundle.findFirst.mockResolvedValue(null);
    prismaMock.deliveryBundle.create.mockResolvedValue({ id: "bundle_1" });

    const { releaseApprovedFiles } = await import("./delivery-release");
    await releaseApprovedFiles("ws_1");

    expect(prismaMock.deliveryBundle.create).toHaveBeenCalledTimes(1);
    const bundleData = prismaMock.deliveryBundle.create.mock.calls[0][0].data;
    expect(bundleData.paymentId).toBeNull();
    expect(bundleData.approvalId).toBe("appr_1");
    expect(prismaMock.deliveryBundleJob.create).toHaveBeenCalledTimes(1);

    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(expect.arrayContaining(["FILES_RELEASED", "DELIVERY_PREPARATION_STARTED"]));
  });

  it("is idempotent — a second call is a no-op when a DeliveryBundle already exists for this approval", async () => {
    await mockOwnedWorkspace();
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_1" });
    prismaMock.deliveryBundle.findFirst.mockResolvedValue({ id: "bundle_existing" });

    const { releaseApprovedFiles } = await import("./delivery-release");
    await releaseApprovedFiles("ws_1");

    expect(prismaMock.deliveryBundle.create).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });
});
