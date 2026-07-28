import { describe, expect, it, vi, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Integration tests for Phase 4 client/workspace mutations against the
 * real, dedicated test database (see vitest.integration.config.ts +
 * DATABASE_SETUP.md). Requires `npm run db:seed:test` to have populated
 * the two demo creators (Arjun Raj / Meera Shah) — `npm run
 * test:integration` does this automatically.
 */

const ARJUN_ID = "usr_arjun";
const MEERA_ID = "usr_meera";
const RUN_ID = Date.now();

const { requireAuthenticatedUserMock } = vi.hoisted(() => ({
  requireAuthenticatedUserMock: vi.fn(),
}));
vi.mock("@/data-access/auth", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}));

function signInAs(userId: string) {
  requireAuthenticatedUserMock.mockResolvedValue({
    id: userId,
    name: userId === ARJUN_ID ? "Arjun Raj" : "Meera Shah",
    email: `${userId}@example.com`,
    role: "CREATOR",
    image: null,
  });
}

const createdClientIds: string[] = [];
const createdWorkspaceIds: string[] = [];

afterAll(async () => {
  await prisma.activityLog.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.activityLog.deleteMany({ where: { clientId: { in: createdClientIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
  await prisma.$disconnect();
});

describe("client mutations", () => {
  it("creates a client under the authenticated creator and logs CLIENT_CREATED", async () => {
    signInAs(ARJUN_ID);
    const { createClient } = await import("./clients");

    const beforeCount = await prisma.activityLog.count({ where: { creatorId: ARJUN_ID, action: "CLIENT_CREATED" } });
    const { id } = await createClient({
      name: `IntegrationTest Client ${RUN_ID}`,
      email: `integration-client-${RUN_ID}@example.com`,
      company: undefined,
      phone: undefined,
      notes: undefined,
    });
    createdClientIds.push(id);

    const stored = await prisma.client.findUniqueOrThrow({ where: { id } });
    expect(stored.creatorId).toBe(ARJUN_ID);

    const afterCount = await prisma.activityLog.count({ where: { creatorId: ARJUN_ID, action: "CLIENT_CREATED" } });
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("edits the creator's own client", async () => {
    signInAs(ARJUN_ID);
    const { updateOwnedClient } = await import("./clients");
    const clientId = createdClientIds[0];

    await updateOwnedClient(clientId, {
      name: `IntegrationTest Client ${RUN_ID} (renamed)`,
      email: `integration-client-${RUN_ID}@example.com`,
      company: undefined,
      phone: undefined,
      notes: undefined,
    });

    const stored = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(stored.name).toBe(`IntegrationTest Client ${RUN_ID} (renamed)`);
  });

  it("refuses to let a different creator edit this client", async () => {
    signInAs(MEERA_ID);
    const { updateOwnedClient } = await import("./clients");
    const { OwnershipError } = await import("./authorization");
    const clientId = createdClientIds[0];

    await expect(
      updateOwnedClient(clientId, {
        name: "Hijacked",
        email: "hijacked@example.com",
        company: undefined,
        phone: undefined,
        notes: undefined,
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("refuses to delete a client that has workspaces (uses the seeded cli_rohit, who owns ws_brand_identity)", async () => {
    signInAs(ARJUN_ID);
    const { deleteOwnedUnusedClient, ClientHasWorkspacesError } = await import("./clients");

    await expect(deleteOwnedUnusedClient("cli_rohit")).rejects.toBeInstanceOf(ClientHasWorkspacesError);

    const stillExists = await prisma.client.findUnique({ where: { id: "cli_rohit" } });
    expect(stillExists).not.toBeNull();
  });

  it("deletes a client with zero workspaces", async () => {
    signInAs(ARJUN_ID);
    const { createClient, deleteOwnedUnusedClient } = await import("./clients");

    const { id } = await createClient({
      name: `IntegrationTest Unused Client ${RUN_ID}`,
      email: `integration-unused-${RUN_ID}@example.com`,
      company: undefined,
      phone: undefined,
      notes: undefined,
    });

    await deleteOwnedUnusedClient(id);

    const stored = await prisma.client.findUnique({ where: { id } });
    expect(stored).toBeNull();
  });
});

describe("workspace mutations", () => {
  it("creates a draft workspace for an owned client", async () => {
    signInAs(ARJUN_ID);
    const { createWorkspace } = await import("./workspaces");

    const { id } = await createWorkspace({
      title: `IntegrationTest Workspace ${RUN_ID}`,
      clientId: createdClientIds[0],
      currency: "INR",
      amount: "12345.00",
      description: undefined,
      dueDate: undefined,
      watermarkText: undefined,
    });
    createdWorkspaceIds.push(id);

    const stored = await prisma.workspace.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe("DRAFT");
    expect(stored.creatorId).toBe(ARJUN_ID);
  });

  it("rejects workspace creation against another creator's client", async () => {
    signInAs(ARJUN_ID);
    const { createWorkspace } = await import("./workspaces");
    const { OwnershipError } = await import("./authorization");

    // cli_devika belongs to Meera, not Arjun.
    await expect(
      createWorkspace({
        title: "Should Fail",
        clientId: "cli_devika",
        currency: "INR",
        amount: "1000",
        description: undefined,
        dueDate: undefined,
        watermarkText: undefined,
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("edits the creator's own workspace and logs an ActivityLog entry", async () => {
    signInAs(ARJUN_ID);
    const { updateOwnedWorkspace } = await import("./workspaces");
    const workspaceId = createdWorkspaceIds[0];

    const beforeCount = await prisma.activityLog.count({ where: { workspaceId } });
    await updateOwnedWorkspace(workspaceId, {
      title: `IntegrationTest Workspace ${RUN_ID} (updated)`,
      clientId: createdClientIds[0],
      currency: "INR",
      amount: "12345.00",
      description: undefined,
      dueDate: undefined,
      watermarkText: undefined,
    });
    const afterCount = await prisma.activityLog.count({ where: { workspaceId } });

    const stored = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(stored.title).toBe(`IntegrationTest Workspace ${RUN_ID} (updated)`);
    expect(afterCount).toBe(beforeCount + 1); // WORKSPACE_UPDATED (title changed)
  });

  it("refuses to let a different creator edit this workspace, and does not create an ActivityLog", async () => {
    signInAs(MEERA_ID);
    const { updateOwnedWorkspace } = await import("./workspaces");
    const { OwnershipError } = await import("./authorization");
    const workspaceId = createdWorkspaceIds[0];

    const beforeCount = await prisma.activityLog.count({ where: { workspaceId } });
    await expect(
      updateOwnedWorkspace(workspaceId, {
        title: "Hijacked",
        clientId: createdClientIds[0],
        currency: "INR",
        amount: "1",
        description: undefined,
        dueDate: undefined,
        watermarkText: undefined,
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    const afterCount = await prisma.activityLog.count({ where: { workspaceId } });

    expect(afterCount).toBe(beforeCount);
  });

  it("does not allow a PAID workspace's amount to be modified (seeded ws_product_pkg, ₹30,000)", async () => {
    signInAs(ARJUN_ID);
    const { updateOwnedWorkspace } = await import("./workspaces");

    const before = await prisma.workspace.findUniqueOrThrow({ where: { id: "ws_product_pkg" } });
    expect(before.status).toBe("PAID");

    await updateOwnedWorkspace("ws_product_pkg", {
      title: before.title,
      clientId: before.clientId,
      currency: "INR",
      amount: "1.00", // attempted tamper — must be ignored
      description: before.description ?? undefined,
      dueDate: undefined,
      watermarkText: before.watermarkText ?? undefined,
    });

    const after = await prisma.workspace.findUniqueOrThrow({ where: { id: "ws_product_pkg" } });
    expect(after.amount.toString()).toBe(before.amount.toString());
    expect(after.currency).toBe(before.currency);
  });

  it("cancels an eligible (DRAFT) workspace", async () => {
    signInAs(ARJUN_ID);
    const { cancelOwnedWorkspace } = await import("./workspaces");
    const workspaceId = createdWorkspaceIds[0];

    await cancelOwnedWorkspace(workspaceId);

    const stored = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(stored.status).toBe("CANCELLED");
    expect(stored.cancelledAt).not.toBeNull();
  });

  it("refuses to cancel the seeded PAID workspace", async () => {
    signInAs(ARJUN_ID);
    const { cancelOwnedWorkspace, InvalidStatusTransitionError } = await import("./workspaces");

    await expect(cancelOwnedWorkspace("ws_product_pkg")).rejects.toBeInstanceOf(InvalidStatusTransitionError);

    const stored = await prisma.workspace.findUniqueOrThrow({ where: { id: "ws_product_pkg" } });
    expect(stored.status).toBe("PAID");
  });
});
