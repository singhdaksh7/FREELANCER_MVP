import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  workspace: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  changeRequest: { findFirst: vi.fn(), create: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  prismaMock.changeRequest.create.mockResolvedValue({ id: "cr_new" });
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

describe("createChangeRequest — validation", () => {
  it("rejects an empty summary", async () => {
    const { createChangeRequest, ChangeRequestValidationError } = await import("./change-requests");
    await expect(createChangeRequest(CONTEXT, { summary: "   " })).rejects.toBeInstanceOf(ChangeRequestValidationError);
  });
});

describe("createChangeRequest — duplicate prevention", () => {
  it("refuses a second OPEN change request instead of creating a duplicate", async () => {
    const { createChangeRequest, ChangeRequestAlreadyOpenError } = await import("./change-requests");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_existing", status: "OPEN" });

    await expect(createChangeRequest(CONTEXT, { summary: "Please fix the logo colors" })).rejects.toBeInstanceOf(
      ChangeRequestAlreadyOpenError,
    );
    expect(prismaMock.changeRequest.create).not.toHaveBeenCalled();
  });
});

describe("createChangeRequest — workflow transition", () => {
  it("refuses when the workspace isn't IN_REVIEW", async () => {
    const { createChangeRequest } = await import("./change-requests");
    const { InvalidStatusTransitionError } = await import("@/lib/workspace-transitions");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "DRAFT", deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);

    await expect(createChangeRequest(CONTEXT, { summary: "Please fix the logo colors" })).rejects.toBeInstanceOf(
      InvalidStatusTransitionError,
    );
  });

  it("creates the change request and moves the workspace to CHANGES_REQUESTED", async () => {
    const { createChangeRequest } = await import("./change-requests");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);

    await createChangeRequest(CONTEXT, { summary: "Please fix the logo colors", reviewerName: "Rohit" });

    expect(prismaMock.workspace.update.mock.calls[0][0].data.status).toBe("CHANGES_REQUESTED");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("CHANGES_REQUESTED");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.actorType).toBe("CLIENT");
  });

  it("does not automatically resolve any open comments", async () => {
    const { createChangeRequest } = await import("./change-requests");
    prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ status: "IN_REVIEW", deliveryMode: "PAYMENT_REQUIRED" });
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);

    await createChangeRequest(CONTEXT, { summary: "Please fix the logo colors" });

    // No reviewComment mutation should be attempted from this data-access module at all.
    expect(Object.keys(prismaMock)).not.toContain("reviewComment");
  });
});
