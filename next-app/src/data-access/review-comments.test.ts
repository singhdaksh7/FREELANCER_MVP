import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests (mocked Prisma) for comment/pin validation, reply-parent
 * workspace consistency, and reviewer-identity labelling. Integration
 * equivalents (real database, real client/creator round trip) live in
 * review-comments.integration.test.ts.
 */

const prismaMock = {
  workspaceFile: { findFirst: vi.fn() },
  fileVersion: { findFirst: vi.fn() },
  reviewComment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/auth", () => ({
  requireAuthenticatedUser: vi.fn().mockResolvedValue({ id: "usr_1", name: "Arjun Raj", email: "a@example.com", role: "CREATOR", image: null }),
}));
vi.mock("@/data-access/authorization", () => ({
  requireOwnedWorkspace: vi.fn().mockResolvedValue({
    creator: { id: "usr_1", name: "Arjun Raj" },
    workspace: { id: "ws_1", creatorId: "usr_1" },
  }),
}));

const FAKE_CONTEXT = {
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

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
  prismaMock.reviewComment.create.mockResolvedValue({ id: "cmt_new", createdAt: new Date("2026-01-01T00:00:00.000Z") });
});

describe("validatePinCoordinates", () => {
  it("accepts coordinates within [0, 1]", async () => {
    const { validatePinCoordinates } = await import("./review-comments");
    expect(() => validatePinCoordinates(0, 0)).not.toThrow();
    expect(() => validatePinCoordinates(1, 1)).not.toThrow();
    expect(() => validatePinCoordinates(0.5, 0.25)).not.toThrow();
  });

  it("accepts both coordinates absent", async () => {
    const { validatePinCoordinates } = await import("./review-comments");
    expect(() => validatePinCoordinates(undefined, undefined)).not.toThrow();
  });

  it("rejects one coordinate present without the other", async () => {
    const { validatePinCoordinates, CommentValidationError } = await import("./review-comments");
    expect(() => validatePinCoordinates(0.5, undefined)).toThrow(CommentValidationError);
    expect(() => validatePinCoordinates(undefined, 0.5)).toThrow(CommentValidationError);
  });

  it("rejects coordinates outside [0, 1] (raw pixel values)", async () => {
    const { validatePinCoordinates, CommentValidationError } = await import("./review-comments");
    expect(() => validatePinCoordinates(-0.1, 0.5)).toThrow(CommentValidationError);
    expect(() => validatePinCoordinates(0.5, 1.1)).toThrow(CommentValidationError);
    expect(() => validatePinCoordinates(400, 300)).toThrow(CommentValidationError);
  });
});

describe("addClientReviewComment — body validation", () => {
  it("rejects an empty comment body", async () => {
    const { addClientReviewComment, CommentValidationError } = await import("./review-comments");
    await expect(addClientReviewComment(FAKE_CONTEXT, { body: "   " })).rejects.toBeInstanceOf(CommentValidationError);
    expect(prismaMock.reviewComment.create).not.toHaveBeenCalled();
  });

  it("rejects a comment body over the max length", async () => {
    const { addClientReviewComment, CommentValidationError } = await import("./review-comments");
    await expect(addClientReviewComment(FAKE_CONTEXT, { body: "a".repeat(2001) })).rejects.toBeInstanceOf(
      CommentValidationError,
    );
  });

  it("accepts a valid comment and labels the reviewer as unverified client identity", async () => {
    const { addClientReviewComment } = await import("./review-comments");
    await addClientReviewComment(FAKE_CONTEXT, { body: "Looks great!", reviewerName: "Priya" });

    const data = prismaMock.reviewComment.create.mock.calls[0][0].data;
    expect(data.authorType).toBe("CLIENT");
    expect(data.reviewerName).toBe("Priya");
    expect(data.creatorAuthorId).toBeNull();
  });

  it("falls back to a generic reviewer label when no name is given", async () => {
    const { addClientReviewComment } = await import("./review-comments");
    await addClientReviewComment(FAKE_CONTEXT, { body: "Hello" });

    expect(prismaMock.reviewComment.create.mock.calls[0][0].data.reviewerName).toBe("Reviewer");
  });
});

describe("addCreatorReviewComment — server-derived identity", () => {
  it("associates the creator identity from the session, never from input", async () => {
    const { addCreatorReviewComment } = await import("./review-comments");
    await addCreatorReviewComment("ws_1", { body: "Thanks for the note" });

    const data = prismaMock.reviewComment.create.mock.calls[0][0].data;
    expect(data.authorType).toBe("CREATOR");
    expect(data.creatorAuthorId).toBe("usr_1");
  });
});

describe("file/version association validation", () => {
  it("rejects a workspaceFileId that doesn't belong to the comment's workspace", async () => {
    const { addClientReviewComment, CommentValidationError } = await import("./review-comments");
    prismaMock.workspaceFile.findFirst.mockResolvedValue(null);

    await expect(
      addClientReviewComment(FAKE_CONTEXT, { body: "hi", workspaceFileId: "file-from-another-workspace" }),
    ).rejects.toBeInstanceOf(CommentValidationError);
    expect(prismaMock.reviewComment.create).not.toHaveBeenCalled();
  });

  it("scopes the workspaceFile lookup by the comment's own workspaceId", async () => {
    const { addClientReviewComment } = await import("./review-comments");
    prismaMock.workspaceFile.findFirst.mockResolvedValue({ id: "file_1" });

    await addClientReviewComment(FAKE_CONTEXT, { body: "hi", workspaceFileId: "file_1" });

    expect(prismaMock.workspaceFile.findFirst.mock.calls[0][0].where.workspaceId).toBe("ws_1");
  });
});

describe("reply workspace consistency", () => {
  it("rejects a parentId that doesn't belong to the same workspace", async () => {
    const { addClientReviewComment, CommentValidationError } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue(null);

    await expect(
      addClientReviewComment(FAKE_CONTEXT, { body: "reply", parentId: "comment-from-another-workspace" }),
    ).rejects.toBeInstanceOf(CommentValidationError);
    expect(prismaMock.reviewComment.create).not.toHaveBeenCalled();
  });

  it("scopes the parent lookup by the reply's own workspaceId (cannot smuggle a cross-workspace parent)", async () => {
    const { addClientReviewComment } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_parent", parentId: null });

    await addClientReviewComment(FAKE_CONTEXT, { body: "reply", parentId: "cmt_parent" });

    expect(prismaMock.reviewComment.findFirst.mock.calls[0][0].where.workspaceId).toBe("ws_1");
  });

  it("rejects replying to a reply (max one level of nesting)", async () => {
    const { addClientReviewComment, CommentValidationError } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_reply", parentId: "cmt_top" });

    await expect(addClientReviewComment(FAKE_CONTEXT, { body: "nested reply", parentId: "cmt_reply" })).rejects.toBeInstanceOf(
      CommentValidationError,
    );
  });

  it("logs COMMENT_REPLIED (not COMMENT_ADDED) for a valid reply", async () => {
    const { addClientReviewComment } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_top", parentId: null });

    await addClientReviewComment(FAKE_CONTEXT, { body: "reply", parentId: "cmt_top" });

    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("COMMENT_REPLIED");
  });
});

describe("resolveReviewComment", () => {
  it("throws CommentNotFoundError for a comment outside the creator's own workspaces", async () => {
    const { resolveReviewComment, CommentNotFoundError } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue(null);

    await expect(resolveReviewComment("cmt_other_creator")).rejects.toBeInstanceOf(CommentNotFoundError);
  });

  it("records the resolver and resolution timestamp, and never deletes the comment", async () => {
    const { resolveReviewComment } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_1", status: "OPEN", workspaceId: "ws_1" });

    await resolveReviewComment("cmt_1");

    const updateData = prismaMock.reviewComment.update.mock.calls[0][0].data;
    expect(updateData.status).toBe("RESOLVED");
    expect(updateData.resolvedById).toBe("usr_1");
    expect(updateData.resolvedAt).toBeInstanceOf(Date);
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("COMMENT_RESOLVED");
  });

  it("is idempotent for an already-resolved comment: no update, no activity log, no error", async () => {
    const { resolveReviewComment } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_1", status: "RESOLVED", workspaceId: "ws_1" });

    await expect(resolveReviewComment("cmt_1")).resolves.toBeUndefined();

    expect(prismaMock.reviewComment.update).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("rejects with CommentNotFoundError when expectedWorkspaceId doesn't match the comment's own workspace (cross-workspace resolve)", async () => {
    const { resolveReviewComment, CommentNotFoundError } = await import("./review-comments");
    // A comment the creator genuinely owns, but under a *different* workspace
    // than the one named in the caller's URL/expectation.
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_1", status: "OPEN", workspaceId: "ws_other" });

    await expect(resolveReviewComment("cmt_1", "ws_1")).rejects.toBeInstanceOf(CommentNotFoundError);
    expect(prismaMock.reviewComment.update).not.toHaveBeenCalled();
  });

  it("succeeds when expectedWorkspaceId matches the comment's own workspace", async () => {
    const { resolveReviewComment } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_1", status: "OPEN", workspaceId: "ws_1" });

    await expect(resolveReviewComment("cmt_1", "ws_1")).resolves.toBeUndefined();
    expect(prismaMock.reviewComment.update).toHaveBeenCalled();
  });
});

describe("createComment return value (via addCreatorReviewComment)", () => {
  it("returns enough data to render the new comment/reply immediately, without a follow-up read", async () => {
    const { addCreatorReviewComment } = await import("./review-comments");
    prismaMock.reviewComment.findFirst.mockResolvedValue({ id: "cmt_top", parentId: null, workspaceFileId: null, fileVersionId: null });
    prismaMock.reviewComment.create.mockResolvedValue({ id: "cmt_reply", createdAt: new Date("2026-01-01T00:00:00.000Z") });

    const reply = await addCreatorReviewComment("ws_1", { body: "Sure, updating now.", parentId: "cmt_top" });

    expect(reply).toEqual({
      id: "cmt_reply",
      parentId: "cmt_top",
      authorType: "CREATOR",
      authorName: "Arjun Raj",
      body: "Sure, updating now.",
      status: "OPEN",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
