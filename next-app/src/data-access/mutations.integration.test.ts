import { describe, expect, it, vi, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Integration tests for Phase 4/8 workspace mutations against the real,
 * dedicated test database (see vitest.integration.config.ts +
 * DATABASE_SETUP.md). Requires `npm run db:seed:test` to have populated
 * the two demo creators (Arjun Raj / Meera Shah) — `npm run
 * test:integration` does this automatically. The saved-Client CRM
 * (createClient/updateOwnedClient/deleteOwnedUnusedClient) was retired in
 * Phase 8 — see MIGRATION_STATUS.md — so these tests now exercise
 * `clientName` as a plain workspace-scoped string instead.
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

const createdWorkspaceIds: string[] = [];

afterAll(async () => {
  await prisma.activityLog.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  await prisma.$disconnect();
});

describe("workspace mutations", () => {
  it("creates a draft workspace from a clientName string, with no Client row created or referenced", async () => {
    signInAs(ARJUN_ID);
    const { createWorkspace } = await import("./workspaces");
    const clientCountBefore = await prisma.client.count();

    const { id } = await createWorkspace({
      title: `IntegrationTest Workspace ${RUN_ID}`,
      clientName: `IntegrationTest Client ${RUN_ID}`,
      currency: "INR",
      deliveryMode: "PAYMENT_REQUIRED",
      amount: "12345.00",
      description: undefined,
      dueDate: undefined,
      watermarkText: undefined,
    });
    createdWorkspaceIds.push(id);

    const stored = await prisma.workspace.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe("DRAFT");
    expect(stored.creatorId).toBe(ARJUN_ID);
    expect(stored.clientName).toBe(`IntegrationTest Client ${RUN_ID}`);
    expect(stored.clientId).toBeNull();

    // Workspace creation must never insert a Client row.
    const clientCountAfter = await prisma.client.count();
    expect(clientCountAfter).toBe(clientCountBefore);
  });

  it("existing workspaces retain a correct clientName (backfilled from Client.name on real pre-Phase-8 rows — see migration 20260731091000)", async () => {
    // ws_brand_identity is seeded with both clientId and clientName in
    // sync with the related Client's name — this is the same invariant
    // migration 20260731091000_workspace_client_name_backfill establishes
    // for every real workspace that predates the clientName column. See
    // prisma/seed.ts / MIGRATION_STATUS.md.
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: "ws_brand_identity" } });
    expect(workspace.clientName).toBe("Rohit Sharma");
    expect(workspace.clientId).not.toBeNull();
  });

  it("rejects a PREVIEW_ONLY submission at the application boundary — no workspace row is ever created", async () => {
    signInAs(ARJUN_ID);
    const { createWorkspaceAction } = await import("../actions/workspaces");
    const workspaceCountBefore = await prisma.workspace.count({ where: { creatorId: ARJUN_ID } });

    const formData = new FormData();
    formData.set("title", `IntegrationTest Rejected Workspace ${RUN_ID}`);
    formData.set("clientName", `IntegrationTest Client ${RUN_ID}`);
    formData.set("deliveryMode", "PREVIEW_ONLY");
    formData.set("currency", "INR");
    formData.set("amount", "");

    const result = await createWorkspaceAction({}, formData);

    expect(result.fieldErrors?.deliveryMode).toBeTruthy();
    const workspaceCountAfter = await prisma.workspace.count({ where: { creatorId: ARJUN_ID } });
    expect(workspaceCountAfter).toBe(workspaceCountBefore);
  });

  it("edits the creator's own workspace (including its client name) and logs an ActivityLog entry", async () => {
    signInAs(ARJUN_ID);
    const { updateOwnedWorkspace } = await import("./workspaces");
    const workspaceId = createdWorkspaceIds[0];

    const beforeCount = await prisma.activityLog.count({ where: { workspaceId } });
    await updateOwnedWorkspace(workspaceId, {
      title: `IntegrationTest Workspace ${RUN_ID} (updated)`,
      clientName: `IntegrationTest Client ${RUN_ID} (renamed)`,
      currency: "INR",
      deliveryMode: "PAYMENT_REQUIRED",
      amount: "12345.00",
      description: undefined,
      dueDate: undefined,
      watermarkText: undefined,
    });
    const afterCount = await prisma.activityLog.count({ where: { workspaceId } });

    const stored = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(stored.title).toBe(`IntegrationTest Workspace ${RUN_ID} (updated)`);
    expect(stored.clientName).toBe(`IntegrationTest Client ${RUN_ID} (renamed)`);
    expect(afterCount).toBe(beforeCount + 2); // WORKSPACE_UPDATED (title changed) + CLIENT_CHANGED (clientName changed) both fire
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
        clientName: "Hijacked Client",
        currency: "INR",
        deliveryMode: "PAYMENT_REQUIRED",
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
      clientName: before.clientName,
      currency: "INR",
      deliveryMode: "PAYMENT_REQUIRED",
      amount: "1.00", // attempted tamper — must be ignored
      description: before.description ?? undefined,
      dueDate: undefined,
      watermarkText: before.watermarkText ?? undefined,
    });

    const after = await prisma.workspace.findUniqueOrThrow({ where: { id: "ws_product_pkg" } });
    expect(after.amount?.toString()).toBe(before.amount?.toString());
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
