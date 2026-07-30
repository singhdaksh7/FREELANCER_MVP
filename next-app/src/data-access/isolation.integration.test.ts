import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "./credentials";
import { createUser, DuplicateEmailError } from "./users";
import { verifyPassword } from "@/lib/password";

/**
 * Integration tests against the real, dedicated test database (see
 * vitest.integration.config.ts + DATABASE_SETUP.md). Requires
 * `npm run db:seed:test` to have populated the two demo creators (Arjun
 * Raj / Meera Shah) — `npm run test:integration` does this automatically.
 */

const ARJUN_ID = "usr_arjun";
const MEERA_ID = "usr_meera";

// The data-access read functions derive `creatorId` from
// requireAuthenticatedUser() — mocking *only* that identity seam (never
// the database itself) lets these tests exercise real Prisma queries
// against the real test database while controlling "who is logged in."
const { requireAuthenticatedUserMock } = vi.hoisted(() => ({
  requireAuthenticatedUserMock: vi.fn(),
}));
vi.mock("@/data-access/auth", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}));

function mockSignedInAs(userId: string) {
  requireAuthenticatedUserMock.mockResolvedValue({
    id: userId,
    name: userId,
    email: `${userId}@example.com`,
    role: "CREATOR",
    image: null,
  });
}

describe("registration stores a hash, never the raw password", () => {
  const testEmail = `integration-test-${Date.now()}@example.com`;

  it("createUser persists a bcrypt hash, and the raw password verifies against it", async () => {
    const rawPassword = "Sup3r$ecret!";
    await createUser({ name: "Integration Test User", email: testEmail, password: rawPassword });

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });

    expect(stored.passwordHash).not.toBe(rawPassword);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    await expect(verifyPassword(rawPassword, stored.passwordHash)).resolves.toBe(true);
  });

  it("rejects a duplicate email (case-insensitively) instead of creating a second account", async () => {
    await expect(
      createUser({ name: "Someone Else", email: testEmail.toUpperCase(), password: "Another$1pass" }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: "integration-test-" } } });
});

describe("verifyCredentials", () => {
  it("authenticates with the seeded demo creator's real credentials", async () => {
    const user = await verifyCredentials("arjun@example.com", "Demo@12345");
    expect(user).toMatchObject({ id: ARJUN_ID, email: "arjun@example.com" });
  });

  it("is case-insensitive on email", async () => {
    const user = await verifyCredentials("ARJUN@EXAMPLE.COM", "Demo@12345");
    expect(user).toMatchObject({ id: ARJUN_ID });
  });

  it("fails generically (returns null) for a wrong password", async () => {
    const user = await verifyCredentials("arjun@example.com", "the-wrong-password");
    expect(user).toBeNull();
  });

  it("fails generically (returns null, the same as a wrong password) for a non-existent email", async () => {
    const user = await verifyCredentials("nobody-like-this-exists@example.com", "whatever-Pass1");
    expect(user).toBeNull();
  });
});

describe("creator data isolation", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockReset();
  });

  it("Arjun cannot query Meera's clients", async () => {
    mockSignedInAs(ARJUN_ID);
    const { getClients } = await import("./clients");
    const { clients } = await getClients({});

    expect(clients.length).toBeGreaterThan(0);
    expect(clients.some((c) => c.name === "Devika Nair")).toBe(false);
    expect(clients.some((c) => c.name === "Farhan Sheikh")).toBe(false);
  });

  it("Meera cannot query Arjun's clients", async () => {
    mockSignedInAs(MEERA_ID);
    const { getClients } = await import("./clients");
    const { clients } = await getClients({});

    expect(clients.length).toBeGreaterThan(0);
    expect(clients.some((c) => c.name === "Rohit Sharma")).toBe(false);
  });

  it("Arjun cannot query Meera's workspaces", async () => {
    mockSignedInAs(ARJUN_ID);
    const { getWorkspaces } = await import("./workspaces");
    const { workspaces } = await getWorkspaces({});

    expect(workspaces.some((w) => w.title === "Portfolio Website Refresh")).toBe(false);
    expect(workspaces.some((w) => w.title === "Restaurant Menu Design")).toBe(false);
  });

  it("Dashboard metrics for Arjun include only Arjun's records", async () => {
    mockSignedInAs(ARJUN_ID);
    const { getDashboardData } = await import("./dashboard");
    const data = await getDashboardData();

    // Arjun's seeded workspaces total 25000 + 45000 + 30000 + 18000 = 118000.
    const total = data.summary.outstandingAmount + data.summary.receivedRevenue;
    expect(total).toBe(118000);
    expect(data.summary.totalWorkspaceCount).toBe(4);
    expect(data.recentWorkspaces.some((w) => w.title === "Portfolio Website Refresh")).toBe(false);
  });

  it("Dashboard metrics for Meera include only Meera's records", async () => {
    mockSignedInAs(MEERA_ID);
    const { getDashboardData } = await import("./dashboard");
    const data = await getDashboardData();

    // Meera's seeded workspaces total 22000 + 15000 = 37000.
    const total = data.summary.outstandingAmount + data.summary.receivedRevenue;
    expect(total).toBe(37000);
    expect(data.summary.totalWorkspaceCount).toBe(2);
  });
});
