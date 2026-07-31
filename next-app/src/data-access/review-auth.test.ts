import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashReviewToken, generateReviewToken } from "@/lib/review-token";

/**
 * Unit tests (mocked Prisma) for authorizeReviewToken's expiry/revocation/
 * shape-rejection rules. Integration equivalents (real database, real
 * cross-workspace boundary) live in review-links.integration.test.ts.
 */

const prismaMock = {
  reviewLink: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rl_1",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    workspace: {
      id: "ws_1",
      title: "Brand Identity",
      description: null,
      amount: 25000,
      currency: "INR",
      status: "IN_REVIEW",
      watermarkText: null,
      clientName: "Rohit Sharma",
      creator: { name: "Arjun Raj" },
    },
    ...overrides,
  };
}

describe("authorizeReviewToken — shape rejection", () => {
  it("rejects a malformed token before touching the database", async () => {
    const { authorizeReviewToken, InvalidReviewTokenError } = await import("./review-auth");
    await expect(authorizeReviewToken("not-a-real-token")).rejects.toBeInstanceOf(InvalidReviewTokenError);
    expect(prismaMock.reviewLink.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an empty string", async () => {
    const { authorizeReviewToken, InvalidReviewTokenError } = await import("./review-auth");
    await expect(authorizeReviewToken("")).rejects.toBeInstanceOf(InvalidReviewTokenError);
  });
});

describe("authorizeReviewToken — lookup miss", () => {
  it("rejects a well-shaped token that doesn't match any stored hash", async () => {
    const { authorizeReviewToken, InvalidReviewTokenError } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(null);

    await expect(authorizeReviewToken(generateReviewToken())).rejects.toBeInstanceOf(InvalidReviewTokenError);
  });

  it("looks the link up by the SHA-256 hash, never the raw token", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    const token = generateReviewToken();
    prismaMock.reviewLink.findUnique.mockResolvedValue(fakeLink());

    await authorizeReviewToken(token);

    const where = prismaMock.reviewLink.findUnique.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashReviewToken(token));
    expect(where.tokenHash).not.toBe(token);
  });
});

describe("authorizeReviewToken — expiry rules", () => {
  it("rejects a link past its expiresAt even if status is still ACTIVE", async () => {
    const { authorizeReviewToken, ReviewLinkExpiredError } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(
      fakeLink({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(authorizeReviewToken(generateReviewToken())).rejects.toBeInstanceOf(ReviewLinkExpiredError);
  });

  it("rejects a link whose status is already EXPIRED", async () => {
    const { authorizeReviewToken, ReviewLinkExpiredError } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(fakeLink({ status: "EXPIRED" }));

    await expect(authorizeReviewToken(generateReviewToken())).rejects.toBeInstanceOf(ReviewLinkExpiredError);
  });

  it("accepts a link with a future expiresAt and ACTIVE status", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(fakeLink());

    const context = await authorizeReviewToken(generateReviewToken());
    expect(context.workspaceId).toBe("ws_1");
  });
});

describe("authorizeReviewToken — revocation rules", () => {
  it("rejects a REVOKED link regardless of expiresAt", async () => {
    const { authorizeReviewToken, ReviewLinkRevokedError } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(fakeLink({ status: "REVOKED" }));

    await expect(authorizeReviewToken(generateReviewToken())).rejects.toBeInstanceOf(ReviewLinkRevokedError);
  });
});

describe("authorizeReviewToken — workspace availability", () => {
  it("rejects a CANCELLED workspace even with a valid link", async () => {
    const { authorizeReviewToken, WorkspaceUnavailableError } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(
      fakeLink({ workspace: { ...fakeLink().workspace, status: "CANCELLED" } }),
    );

    await expect(authorizeReviewToken(generateReviewToken())).rejects.toBeInstanceOf(WorkspaceUnavailableError);
  });
});

describe("authorizeReviewToken — returned context never leaks creator internals", () => {
  it("returns only workspace-scoped, business-safe fields", async () => {
    const { authorizeReviewToken } = await import("./review-auth");
    prismaMock.reviewLink.findUnique.mockResolvedValue(fakeLink());

    const context = await authorizeReviewToken(generateReviewToken());

    expect(context).toEqual({
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
      },
    });
    expect(JSON.stringify(context)).not.toMatch(/passwordHash|email/i);
  });
});
