import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for the Phase 4 mutation restrictions: paid
 * workspace edit locking, client deletion blocked by existing workspaces,
 * unsupported workspace status transitions, and owned-client selection
 * validation. src/data-access/*.integration.test.ts covers the equivalent
 * behavior against a real database.
 */

const FAKE_CREATOR = { id: "usr_fake", name: "Fake Creator", email: "fake@example.com", role: "CREATOR", image: null };

const prismaMock = {
  client: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
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

describe("client deletion restriction when workspaces exist", () => {
  it("refuses to delete a client that still has workspaces", async () => {
    const { deleteOwnedUnusedClient, ClientHasWorkspacesError } = await import("./clients");
    prismaMock.client.findFirst.mockResolvedValue({ id: "cli_1", name: "Rohit", creatorId: FAKE_CREATOR.id });
    prismaMock.workspace.count.mockResolvedValue(2);

    await expect(deleteOwnedUnusedClient("cli_1")).rejects.toBeInstanceOf(ClientHasWorkspacesError);
    expect(prismaMock.client.delete).not.toHaveBeenCalled();
  });

  it("deletes a client with zero workspaces and logs a CLIENT_DELETED activity entry", async () => {
    const { deleteOwnedUnusedClient } = await import("./clients");
    prismaMock.client.findFirst.mockResolvedValue({ id: "cli_1", name: "Rohit", creatorId: FAKE_CREATOR.id });
    prismaMock.workspace.count.mockResolvedValue(0);
    prismaMock.client.delete.mockResolvedValue({ id: "cli_1" });

    await deleteOwnedUnusedClient("cli_1");

    expect(prismaMock.client.delete).toHaveBeenCalledWith({ where: { id: "cli_1" } });
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
    const activityCall = prismaMock.activityLog.create.mock.calls[0][0];
    expect(activityCall.data.action).toBe("CLIENT_DELETED");
    // The client no longer exists once this commits — clientId must not be set on its own delete entry.
    expect(activityCall.data.clientId).toBeUndefined();
  });
});

describe("owned-client selection validation", () => {
  it("createWorkspace refuses a clientId that doesn't belong to the authenticated creator", async () => {
    const { createWorkspace } = await import("./workspaces");
    const { OwnershipError } = await import("./authorization");
    prismaMock.client.findFirst.mockResolvedValue(null);

    await expect(
      createWorkspace({
        title: "Untitled",
        clientId: "someone-elses-client",
        currency: "INR",
        amount: "1000",
      } as never),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(prismaMock.workspace.create).not.toHaveBeenCalled();
  });

  it("createWorkspace succeeds and logs WORKSPACE_CREATED for an owned client", async () => {
    const { createWorkspace } = await import("./workspaces");
    prismaMock.client.findFirst.mockResolvedValue({ id: "cli_1", name: "Rohit", creatorId: FAKE_CREATOR.id });
    prismaMock.workspace.create.mockResolvedValue({ id: "ws_new" });

    const result = await createWorkspace({
      title: "Brand Identity",
      clientId: "cli_1",
      currency: "INR",
      amount: "25000",
    } as never);

    expect(result).toEqual({ id: "ws_new" });
    expect(prismaMock.workspace.create.mock.calls[0][0].data.creatorId).toBe(FAKE_CREATOR.id);
    expect(prismaMock.activityLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("WORKSPACE_CREATED");
  });
});

describe("paid-workspace edit restrictions", () => {
  function existingWorkspace(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      clientId: "cli_1",
      title: "Product Packaging Design",
      description: null,
      currency: "INR",
      amount: { equals: (v: unknown) => String(v) === "30000", toString: () => "30000" },
      status: "PAID",
      watermarkText: null,
      dueDate: null,
      client: { id: "cli_1", name: "Karan Mehta", company: null },
      ...overrides,
    };
  }

  it("keeps amount, currency, and client unchanged for a PAID workspace even if the form submits different values", async () => {
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
      clientId: "cli_someone_else",
      currency: "INR",
      amount: "99999",
      description: undefined,
      watermarkText: undefined,
      dueDate: undefined,
    } as never);

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(updateData.clientId).toBe("cli_1");
    expect(String(updateData.amount)).toBe("30000");
    expect(updateData.currency).toBe("INR");
    // Only the descriptive field actually changed — no AMOUNT_CHANGED/CLIENT_CHANGED entry should be written.
    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(["WORKSPACE_UPDATED"]);
  });

  it("allows amount/currency/client changes for a non-locked (DRAFT) workspace", async () => {
    const { toDecimal } = await import("@/lib/decimal");
    const { updateOwnedWorkspace } = await import("./workspaces");

    const existing = { ...existingWorkspace({ status: "DRAFT" }), amount: toDecimal("30000.00") };
    prismaMock.workspace.findFirst.mockResolvedValue(existing);
    prismaMock.client.findFirst.mockResolvedValue({ id: "cli_2", name: "Priya Verma", creatorId: FAKE_CREATOR.id });
    prismaMock.workspace.update.mockResolvedValue({ id: "ws_1" });

    await updateOwnedWorkspace("ws_1", {
      title: existing.title,
      clientId: "cli_2",
      currency: "INR",
      amount: "35000",
      description: undefined,
      watermarkText: undefined,
      dueDate: undefined,
    } as never);

    const updateData = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(updateData.clientId).toBe("cli_2");
    expect(String(updateData.amount)).toBe("35000");
    const actions = prismaMock.activityLog.create.mock.calls.map((call) => call[0].data.action);
    expect(actions).toEqual(expect.arrayContaining(["CLIENT_CHANGED", "AMOUNT_CHANGED"]));
  });
});

describe("unsupported workspace status transitions", () => {
  it("refuses to cancel a PAID workspace", async () => {
    const { cancelOwnedWorkspace, InvalidStatusTransitionError } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "PAID",
      client: { id: "cli_1", name: "Karan" },
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
      client: { id: "cli_1", name: "Karan" },
    });

    await expect(cancelOwnedWorkspace("ws_1")).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  });

  it("cancels a DRAFT workspace and logs WORKSPACE_CANCELLED", async () => {
    const { cancelOwnedWorkspace } = await import("./workspaces");
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      creatorId: FAKE_CREATOR.id,
      status: "DRAFT",
      client: { id: "cli_1", name: "Karan" },
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
      client: { id: "cli_1", name: "Karan" },
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
      client: { id: "cli_1", name: "Karan" },
    });
    prismaMock.payment.count.mockResolvedValue(1);
    prismaMock.activityLog.count.mockResolvedValue(0);

    await expect(deleteOwnedDraftWorkspace("ws_1")).rejects.toBeInstanceOf(WorkspaceNotDeletableError);
  });
});
