import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the Phase 4/8 mutation restrictions: paid
 * workspace edit locking and unsupported workspace status transitions.
 * src/data-access/*.integration.test.ts covers the equivalent behavior
 * against a real database. The saved-Client CRM (createClient,
 * deleteOwnedUnusedClient, etc.) was retired in Phase 8 — see
 * MIGRATION_STATUS.md — so workspace creation/edit now takes a plain
 * `clientName` string with no ownership check or Client row involved.
 */

const FAKE_CREATOR = { id: "usr_fake", name: "Fake Creator", email: "fake@example.com", role: "CREATOR", image: null };

const prismaMock = {
  workspace: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  payment: { count: vi.fn() },
  activityLog: { create: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/auth", () => ({
  requireAuthenticatedUser: vi.fn().mockResolvedValue(FAKE_CREATOR),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
});

describe("workspace creation with a plain client-name textbox", () => {
  it("creates a workspace from a clientName string without ever touching the Client table", async () => {
    const { createWorkspace } = await import("./workspaces");
    prismaMock.workspace.create.mockResolvedValue({ id: "ws_new" });

    const result = await createWorkspace({
      title: "Brand Identity",
      clientName: "Rohit Sharma",
      deliveryMode: "PAYMENT_REQUIRED",
      currency: "INR",
      amount: "25000",
    } as never);

    expect(result).toEqual({ id: "ws_new" });
    const createData = prismaMock.workspace.create.mock.calls[0][0].data;
    expect(createData.creatorId).toBe(FAKE_CREATOR.id);
    expect(createData.clientName).toBe("Rohit Sharma");
    expect(createData.clientId).toBeUndefined();
    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(["WORKSPACE_CREATED", "DELIVERY_MODE_SELECTED"]);
  });
});

describe("paid-workspace edit restrictions", () => {
  function existingWorkspace(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      clientId: "cli_1",
      clientName: "Karan Mehta",
      title: "Product Packaging Design",
      description: null,
      currency: "INR",
      amount: { equals: (v: unknown) => String(v) === "30000", toString: () => "30000" },
      status: "PAID",
      deliveryMode: "PAYMENT_REQUIRED",
      watermarkText: null,
      dueDate: null,
      ...overrides,
    };
  }

  it("keeps amount, currency, and client name unchanged for a PAID workspace even if the form submits different values", async () => {
    const { toDecimal } = await import("@/lib/decimal");
    const { updateOwnedWorkspace } = await import("./workspaces");

    const existing = {
      ...existingWorkspace(),
      amount: toDecimal("30000.00"),
    };
    prismaMock.workspace.findFirst.mockResolvedValue(existing);
    prismaMock.workspace.update.mockResolvedValue({ id: "ws_1" });

    await updateOwnedWorkspace("ws_1", {
      title: "Product Packaging Design (Updated)",
      clientName: "Someone Else",
      currency: "INR",
      amount: "99999",
      description: undefined,
      watermarkText: undefined,
      dueDate: undefined,
    } as never);

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    // Same financial lock that used to protect the Client relation now
    // protects the clientName snapshot too — a PAID workspace's client
    // name can no longer be changed, same as amount/currency.
    expect(updateData.clientName).toBe("Karan Mehta");
    expect(String(updateData.amount)).toBe("30000");
    expect(updateData.currency).toBe("INR");
    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(["WORKSPACE_UPDATED"]);
  });

  it("allows amount/currency/client name changes for a non-locked (DRAFT) workspace", async () => {
    const { toDecimal } = await import("@/lib/decimal");
    const { updateOwnedWorkspace } = await import("./workspaces");

    const existing = { ...existingWorkspace({ status: "DRAFT" }), amount: toDecimal("30000.00") };
    prismaMock.workspace.findFirst.mockResolvedValue(existing);
    prismaMock.workspace.update.mockResolvedValue({ id: "ws_1" });

    await updateOwnedWorkspace("ws_1", {
      title: existing.title,
      clientName: "Priya Verma",
      currency: "INR",
      amount: "35000",
      description: undefined,
      watermarkText: undefined,
      dueDate: undefined,
    } as never);

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(updateData.clientName).toBe("Priya Verma");
    expect(String(updateData.amount)).toBe("35000");
    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(expect.arrayContaining(["CLIENT_CHANGED", "AMOUNT_CHANGED"]));
  });

  it("locks amount/currency (but not client name) for an APPROVED-but-not-yet-PAID workspace — Phase 7.5 security-gate fix", async () => {
    const { toDecimal } = await import("@/lib/decimal");
    const { updateOwnedWorkspace } = await import("./workspaces");

    const existing = { ...existingWorkspace({ status: "APPROVED" }), amount: toDecimal("30000.00") };
    prismaMock.workspace.findFirst.mockResolvedValue(existing);
    prismaMock.workspace.update.mockResolvedValue({ id: "ws_1" });

    await updateOwnedWorkspace("ws_1", {
      title: existing.title,
      clientName: "Priya Verma",
      currency: "INR",
      amount: "1.00", // attempted tamper between approval and payment — must be ignored
      description: undefined,
      watermarkText: undefined,
      dueDate: undefined,
    } as never);

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(String(updateData.amount)).toBe("30000");
    expect(updateData.currency).toBe("INR");
    expect(updateData.clientName).toBe("Priya Verma");
    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).not.toContain("AMOUNT_CHANGED");
  });

  it("locks amount/currency for a PAYMENT_PENDING workspace", async () => {
    const { toDecimal } = await import("@/lib/decimal");
    const { updateOwnedWorkspace } = await import("./workspaces");

    const existing = { ...existingWorkspace({ status: "PAYMENT_PENDING" }), amount: toDecimal("30000.00") };
    prismaMock.workspace.findFirst.mockResolvedValue(existing);
    prismaMock.workspace.update.mockResolvedValue({ id: "ws_1" });

    await updateOwnedWorkspace("ws_1", {
      title: existing.title,
      clientName: existing.clientName,
      currency: "INR",
      amount: "1.00",
      description: undefined,
      watermarkText: undefined,
      dueDate: undefined,
    } as never);

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(String(updateData.amount)).toBe("30000");
  });
});

describe("unsupported workspace status transitions", () => {
  it("refuses to cancel a PAID workspace", async () => {
    const { cancelOwnedWorkspace, InvalidStatusTransitionError } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "PAID",
      deliveryMode: "PAYMENT_REQUIRED",
      clientName: "Karan Mehta",
    });

    await expect(cancelOwnedWorkspace("ws_1")).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it("refuses to cancel an already-CANCELLED workspace", async () => {
    const { cancelOwnedWorkspace, InvalidStatusTransitionError } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "CANCELLED",
      deliveryMode: "PAYMENT_REQUIRED",
      clientName: "Karan Mehta",
    });

    await expect(cancelOwnedWorkspace("ws_1")).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  });

  it("cancels a DRAFT workspace and logs WORKSPACE_CANCELLED", async () => {
    const { cancelOwnedWorkspace } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "DRAFT",
      deliveryMode: "PAYMENT_REQUIRED",
      clientName: "Karan Mehta",
    });
    prismaMock.workspace.update.mockResolvedValue({ id: "ws_1" });

    await cancelOwnedWorkspace("ws_1");

    expect(prismaMock.workspace.update.mock.calls[0][0].data.status).toBe("CANCELLED");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("WORKSPACE_CANCELLED");
  });

  it("refuses to permanently delete a non-DRAFT workspace", async () => {
    const { deleteOwnedDraftWorkspace, WorkspaceNotDeletableError } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "IN_REVIEW",
      clientName: "Karan Mehta",
    });

    await expect(deleteOwnedDraftWorkspace("ws_1")).rejects.toBeInstanceOf(WorkspaceNotDeletableError);
    expect(prismaMock.workspace.delete).not.toHaveBeenCalled();
  });

  it("refuses to permanently delete a DRAFT workspace that already has payment history", async () => {
    const { deleteOwnedDraftWorkspace, WorkspaceNotDeletableError } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "DRAFT",
      clientName: "Karan Mehta",
    });
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.activityLog.count.mockResolvedValue(0);

    await expect(deleteOwnedDraftWorkspace("ws_1")).rejects.toBeInstanceOf(WorkspaceNotDeletableError);
  });
});
