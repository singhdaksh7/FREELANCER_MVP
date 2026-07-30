import { describe, expect, it, vi } from "vitest";

/**
 * Verifies the core security invariant of the data-access layer: every
 * query is scoped by the *authenticated session's* creator id — never by
 * anything an unauthenticated caller could supply. These are unit tests
 * (Prisma itself is mocked) that assert the shape of the query, not a
 * live-database check; src/data-access/isolation.integration.test.ts
 * covers the equivalent behavior against a real Postgres database.
 */

const FAKE_CREATOR_ID = "usr_fake_creator";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findMany: vi.fn().mockResolvedValue([]) },
    client: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    notification: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    reviewLink: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/data-access/auth", () => ({
  requireAuthenticatedUser: vi.fn().mockResolvedValue({
    id: FAKE_CREATOR_ID,
    name: "Fake Creator",
    email: "fake@example.com",
    role: "CREATOR",
    image: null,
  }),
}));

describe("data-access scoping", () => {
  it("getWorkspaces scopes both the workspace query and the client-options query by the session's creator id", async () => {
    const { getWorkspaces } = await import("./workspaces");
    await getWorkspaces({});

    const workspaceWhere = prismaMock.workspace.findMany.mock.calls[0][0].where;
    expect(workspaceWhere.creatorId).toBe(FAKE_CREATOR_ID);

    const clientWhere = prismaMock.client.findMany.mock.calls[0][0].where;
    expect(clientWhere.creatorId).toBe(FAKE_CREATOR_ID);
  });

  it("getClients scopes the query by the session's creator id, never a caller-supplied one", async () => {
    const { getClients } = await import("./clients");
    // Even if a caller tried to smuggle a creatorId through raw params, it must be ignored.
    await getClients({ creatorId: "someone-elses-id" } as never);

    const where = prismaMock.client.findMany.mock.calls.at(-1)![0].where;
    expect(where.creatorId).toBe(FAKE_CREATOR_ID);
  });

  it("getPayments scopes the query through workspace.creatorId, from the session only", async () => {
    const { getPayments } = await import("./payments");
    await getPayments({});

    const where = prismaMock.payment.findMany.mock.calls[0][0].where;
    expect(where.workspace.creatorId).toBe(FAKE_CREATOR_ID);
  });

  it("getNotifications scopes the query by the session's userId", async () => {
    const { getNotifications } = await import("./notifications");
    await getNotifications();

    const where = prismaMock.notification.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(FAKE_CREATOR_ID);
  });
});
