import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  workspaceFile: { findMany: vi.fn() },
  reviewLink: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  workspace: { update: vi.fn() },
  fileVersion: { updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

class MockOwnershipError extends Error {
  constructor(message = "Not found, or you do not have access to it.") {
    super(message);
    this.name = "OwnershipError";
  }
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/authorization", () => ({
  OwnershipError: MockOwnershipError,
  requireOwnedWorkspace: vi.fn(async (id: string) => {
    if (id === "ws_other_creator") {
      throw new MockOwnershipError();
    }
    return { creator: { id: "usr_1", name: "Arjun Raj" }, workspace: { id, status: "IN_REVIEW" } };
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  prismaMock.reviewLink.create.mockResolvedValue({ id: "rl_new" });
});

describe("createReviewLink — eligibility rules", () => {
  it("refuses a workspace with zero non-deleted files", async () => {
    const { createReviewLink, ReviewLinkNotEligibleError } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([]);

    await expect(createReviewLink("ws_1")).rejects.toBeInstanceOf(ReviewLinkNotEligibleError);
    expect(prismaMock.reviewLink.create).not.toHaveBeenCalled();
  });

  it("refuses a workspace with files but none READY", async () => {
    const { createReviewLink, ReviewLinkNotEligibleError } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "PROCESSING" }]);

    await expect(createReviewLink("ws_1")).rejects.toBeInstanceOf(ReviewLinkNotEligibleError);
  });

  it("refuses a workspace with an unresolved upload in progress even if another file is READY", async () => {
    const { createReviewLink, ReviewLinkNotEligibleError } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }, { status: "UPLOADING" }]);

    await expect(createReviewLink("ws_1")).rejects.toBeInstanceOf(ReviewLinkNotEligibleError);
  });

  it("creates a link when at least one file is READY and nothing is unresolved", async () => {
    const { createReviewLink } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }, { status: "FAILED" }]);

    const result = await createReviewLink("ws_1");
    expect(result.rawToken).toBeTruthy();
    expect(prismaMock.reviewLink.create).toHaveBeenCalledTimes(1);
  });

  it("never stores the raw token — only tokenHash and tokenPrefix are written", async () => {
    const { createReviewLink } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }]);

    const result = await createReviewLink("ws_1");
    const createData = prismaMock.reviewLink.create.mock.calls[0][0].data;
    expect(createData.tokenHash).not.toBe(result.rawToken);
    expect(Object.keys(createData)).not.toContain("rawToken");
    expect(Object.keys(createData)).not.toContain("token");
  });

  it("never includes the raw token in the activity metadata", async () => {
    const { createReviewLink } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }]);

    const result = await createReviewLink("ws_1");
    const activityCall = prismaMock.activityLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(activityCall.metadata)).not.toContain(result.rawToken);
  });

  it("creates a project-duration link (expiresAt null) by default — not a permanent claim, just no fixed TTL", async () => {
    const { createReviewLink } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }]);

    const result = await createReviewLink("ws_1");
    expect(result.expiresAt).toBeNull();
    const createData = prismaMock.reviewLink.create.mock.calls[0][0].data;
    expect(createData.expiresAt).toBeNull();
  });
});

describe("createReviewLink — ownership boundary", () => {
  it("refuses to create a link for a workspace the creator does not own", async () => {
    const { createReviewLink } = await import("./review-links");
    const { OwnershipError } = await import("@/data-access/authorization");

    await expect(createReviewLink("ws_other_creator")).rejects.toBeInstanceOf(OwnershipError);
    expect(prismaMock.reviewLink.create).not.toHaveBeenCalled();
  });
});

describe("revokeReviewLink", () => {
  it("throws ReviewLinkNotFoundError when there is no active link", async () => {
    const { revokeReviewLink, ReviewLinkNotFoundError } = await import("./review-links");
    prismaMock.reviewLink.findFirst.mockResolvedValue(null);

    await expect(revokeReviewLink("ws_1")).rejects.toBeInstanceOf(ReviewLinkNotFoundError);
  });

  it("marks the active link REVOKED and logs REVIEW_LINK_REVOKED", async () => {
    const { revokeReviewLink } = await import("./review-links");
    prismaMock.reviewLink.findFirst.mockResolvedValue({ id: "rl_1", status: "ACTIVE" });

    await revokeReviewLink("ws_1");

    expect(prismaMock.reviewLink.update.mock.calls[0][0].data.status).toBe("REVOKED");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("REVIEW_LINK_REVOKED");
  });
});

describe("regenerateReviewLink", () => {
  it("revokes the old link and points its replacedById at the new one — old token cannot be reused", async () => {
    const { regenerateReviewLink } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }]);
    prismaMock.reviewLink.findFirst.mockResolvedValue({ id: "rl_old", status: "ACTIVE" });
    prismaMock.reviewLink.create.mockResolvedValue({ id: "rl_new" });

    await regenerateReviewLink("ws_1");

    expect(prismaMock.reviewLink.update).toHaveBeenCalledWith({
      where: { id: "rl_old" },
      data: expect.objectContaining({ status: "REVOKED", replacedById: "rl_new" }),
    });
  });

  it("issues a brand-new token distinct from any previous one", async () => {
    const { regenerateReviewLink } = await import("./review-links");
    prismaMock.workspaceFile.findMany.mockResolvedValue([{ status: "READY" }]);
    prismaMock.reviewLink.findFirst.mockResolvedValue(null);

    const first = await regenerateReviewLink("ws_1");
    const second = await regenerateReviewLink("ws_1");
    expect(first.rawToken).not.toBe(second.rawToken);
  });
});
