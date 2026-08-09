import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for approval snapshot generation and
 * blocking rules. Integration equivalent (real database, full
 * request-changes -> submit-revision -> approve round trip) lives in
 * approvals.integration.test.ts.
 */

const prismaMock = {
  workspace: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  workspaceApproval: { findFirst: vi.fn(), create: vi.fn() },
  changeRequest: { findFirst: vi.fn() },
  workspaceFile: { findMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const ensureApprovedDeliveryEnqueued = vi.fn();
vi.mock("./delivery-release", () => ({ ensureApprovedDeliveryEnqueued }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  prismaMock.workspaceApproval.create.mockResolvedValue({ id: "appr_1" });
  ensureApprovedDeliveryEnqueued.mockResolvedValue(undefined);
});

const CONTEXT = {
  reviewLinkId: "rl_1",
  workspaceId: "ws_1",
  workspace: {
    id: "ws_1",
    title: "Brand Identity",
    description: null,
    amount: 25000,
    currency: "INR",
    status: "IN_REVIEW",
    watermarkText: null,
    creatorName: "Arjun Raj",
    client: { name: "Rohit Sharma" },
    deliveryMode: "PAYMENT_REQUIRED" as const,
  },
};

function readyFile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "file_1",
    displayName: "Logo.png",
    currentVersion: { id: "ver_1", versionNumber: 1, status: "READY", submittedAt: new Date() },
    ...overrides,
  };
}

describe("approveWorkspace — validation", () => {
  it("rejects a missing reviewer name", async () => {
    const { approveWorkspace, ApprovalValidationError } = await import("./approvals");
    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "  ", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
  });

  it("rejects when terms are not accepted", async () => {
    const { approveWorkspace, ApprovalValidationError } = await import("./approvals");
    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: false }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
  });
});

describe("approveWorkspace — blocking rules", () => {
  it("blocks approval while a change request remains open", async () => {
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_1", status: "OPEN" });

    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalBlockedError);
    expect(prismaMock.workspaceApproval.create).not.toHaveBeenCalled();
  });

  it("blocks approval while a submitted file is still processing", async () => {
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      readyFile({ currentVersion: { id: "ver_1", versionNumber: 1, status: "PROCESSING", submittedAt: new Date() } }),
    ]);

    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalBlockedError);
  });

  it("blocks approval while a submitted file is FAILED", async () => {
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      readyFile({ currentVersion: { id: "ver_1", versionNumber: 1, status: "FAILED", submittedAt: new Date() } }),
    ]);

    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalBlockedError);
  });

  it("blocks approval when the workspace is not IN_REVIEW", async () => {
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "DRAFT", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);

    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalBlockedError);
  });

  it("rejects a second approval attempt as already completed", async () => {
    const { approveWorkspace, ApprovalAlreadyCompletedError } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue({ id: "appr_existing", status: "APPROVED" });

    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalAlreadyCompletedError);
  });
});

describe("approveWorkspace — snapshot generation and unlock guarantees", () => {
  it("creates an immutable snapshot of exactly the submitted current versions", async () => {
    const { approveWorkspace } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([readyFile(), readyFile({ id: "file_2", currentVersion: null })]);

    await approveWorkspace(CONTEXT, { reviewerName: "Rohit Sharma", termsAccepted: true });

    const createCall = prismaMock.workspaceApproval.create.mock.calls[0][0].data;
    expect(createCall.approvedFileVersionSnapshot).toEqual([
      { workspaceFileId: "file_1", displayName: "Logo.png", fileVersionId: "ver_1", versionNumber: 1 },
    ]);
    expect(createCall.status).toBe("APPROVED");
    expect(createCall.termsAccepted).toBe(true);
  });

  it("sets workspace status to APPROVED — never PAID or FILES_UNLOCKED", async () => {
    const { approveWorkspace } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([readyFile()]);

    await approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true });

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(updateData.status).toBe("APPROVED");
    expect(updateData.status).not.toBe("PAID");
    expect(updateData.status).not.toBe("FILES_UNLOCKED");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("PROJECT_APPROVED");
    // PAYMENT_REQUIRED still needs a captured payment before delivery — approval alone must not trigger it.
    expect(ensureApprovedDeliveryEnqueued).not.toHaveBeenCalled();
  });

  it("APPROVAL_ONLY: moves straight to AWAITING_CREATOR_RELEASE and automatically triggers delivery — no manual creator action", async () => {
    const { approveWorkspace } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "APPROVAL_ONLY", amount: null, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([readyFile()]);

    await approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true });

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(updateData.status).toBe("AWAITING_CREATOR_RELEASE");
    expect(ensureApprovedDeliveryEnqueued).toHaveBeenCalledWith("ws_1");
  });

  it("APPROVAL_ONLY: a delivery-enqueue failure never fails the approval itself", async () => {
    const { approveWorkspace } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "APPROVAL_ONLY", amount: null, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([readyFile()]);
    ensureApprovedDeliveryEnqueued.mockRejectedValue(new Error("transient DB error"));

    const result = await approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true });

    expect(result.id).toBe("appr_1");
  });

  it("blocks approval when there is nothing submitted for review yet", async () => {
    const { approveWorkspace, ApprovalBlockedError } = await import("./approvals");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED", amount: 25000, currency: "INR" });
    prismaMock.workspaceApproval.findFirst.mockResolvedValue(null);
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);
    prismaMock.workspaceFile.findMany.mockResolvedValue([readyFile({ currentVersion: null })]);

    await expect(
      approveWorkspace(CONTEXT, { reviewerName: "Rohit", termsAccepted: true }),
    ).rejects.toBeInstanceOf(ApprovalBlockedError);
  });
});
