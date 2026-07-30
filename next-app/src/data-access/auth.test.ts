import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

beforeEach(() => {
  vi.clearAllMocks();
  // getAuthenticatedCreator is wrapped in React's cache(), which memoizes
  // forever within a module instance (there's no request boundary to key
  // off outside an actual render) — reset the module registry so each
  // test gets a fresh, unmemoized copy instead of a stale cached result
  // from a previous test's mocks.
  vi.resetModules();
});

describe("requireAuthenticatedUser (definitive server-side auth check)", () => {
  it("redirects to /login when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const { requireAuthenticatedUser } = await import("./auth");

    await expect(requireAuthenticatedUser()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session user no longer exists in the database", async () => {
    authMock.mockResolvedValue({ user: { id: "usr_deleted" } });
    prismaMock.user.findUnique.mockResolvedValue(null);
    const { requireAuthenticatedUser } = await import("./auth");

    await expect(requireAuthenticatedUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns the user (re-read from the database, not just the JWT) when authenticated", async () => {
    authMock.mockResolvedValue({ user: { id: "usr_arjun" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "usr_arjun",
      name: "Arjun Raj",
      email: "arjun@example.com",
      role: "CREATOR",
      image: null,
    });
    const { requireAuthenticatedUser } = await import("./auth");

    const user = await requireAuthenticatedUser();
    expect(user).toEqual({
      id: "usr_arjun",
      name: "Arjun Raj",
      email: "arjun@example.com",
      role: "CREATOR",
      image: null,
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "usr_arjun" } }),
    );
  });
});

describe("requireCreatorRole", () => {
  it("redirects to /permission-denied for a non-CREATOR role", async () => {
    authMock.mockResolvedValue({ user: { id: "usr_admin" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "usr_admin",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      image: null,
    });
    const { requireCreatorRole } = await import("./auth");

    await expect(requireCreatorRole()).rejects.toThrow("REDIRECT:/permission-denied");
  });

  it("returns the user for a CREATOR role", async () => {
    authMock.mockResolvedValue({ user: { id: "usr_arjun" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "usr_arjun",
      name: "Arjun Raj",
      email: "arjun@example.com",
      role: "CREATOR",
      image: null,
    });
    const { requireCreatorRole } = await import("./auth");

    const user = await requireCreatorRole();
    expect(user.role).toBe("CREATOR");
  });
});
