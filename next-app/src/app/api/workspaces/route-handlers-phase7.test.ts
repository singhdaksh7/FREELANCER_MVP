import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Avoids pulling the real data-access/authorization module (and its
// next-auth/next/server import chain, which Vitest's plain Node resolution
// can't follow) into this route-handler test.
const { OwnershipError } = vi.hoisted(() => ({
  OwnershipError: class OwnershipError extends Error {
    constructor(message = "Not found, or you do not have access to it.") {
      super(message);
      this.name = "OwnershipError";
    }
  },
}));

/**
 * PHASE 7 Route Handler fallback coverage — file deletion, review-link
 * creation, and workspace cancellation each got a same-origin
 * authenticated Route Handler (POST) that a client fetch()es directly
 * instead of relying on a Server Action's RSC merge. This asserts:
 * cross-origin rejection, ownership/ineligibility mapped to safe JSON,
 * and success returning the same data the old Server Action did.
 *
 * Mocks below use a plain mutable `impl` function assigned per test rather
 * than `vi.fn().mockImplementation(...)` for the rejecting cases — in this
 * project's Vitest/jsdom setup, a `vi.fn()` whose implementation
 * throws/rejects is independently flagged as an unhandled rejection by the
 * test runner even though the route's own try/catch demonstrably handles
 * it (verified with a standalone repro), which would make these tests
 * flaky for reasons unrelated to the route's actual behavior.
 */
const { deleteOwnedFile, deleteOwnedFileCalls, FileNotDeletableError } = vi.hoisted(() => {
  let impl: (fileId: string) => Promise<void> = async () => {};
  const calls: string[] = [];
  return {
    deleteOwnedFile: Object.assign(
      async (fileId: string) => {
        calls.push(fileId);
        return impl(fileId);
      },
      { set: (fn: typeof impl) => (impl = fn) },
    ),
    deleteOwnedFileCalls: calls,
    FileNotDeletableError: class FileNotDeletableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "FileNotDeletableError";
      }
    },
  };
});
vi.mock("@/data-access/files", () => ({ deleteOwnedFile, FileNotDeletableError }));

const { createReviewLink, createReviewLinkCalls, ReviewLinkNotEligibleError } = vi.hoisted(() => {
  let impl: (workspaceId: string) => Promise<{ rawToken: string; expiresAt: string | null }> = async () => ({
    rawToken: "tok",
    expiresAt: null,
  });
  const calls: string[] = [];
  return {
    createReviewLink: Object.assign(
      async (workspaceId: string) => {
        calls.push(workspaceId);
        return impl(workspaceId);
      },
      { set: (fn: typeof impl) => (impl = fn) },
    ),
    createReviewLinkCalls: calls,
    ReviewLinkNotEligibleError: class ReviewLinkNotEligibleError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ReviewLinkNotEligibleError";
      }
    },
  };
});
const { revokeReviewLink, revokeReviewLinkCalls, ReviewLinkNotFoundError } = vi.hoisted(() => {
  let impl: (workspaceId: string) => Promise<void> = async () => {};
  const calls: string[] = [];
  return {
    revokeReviewLink: Object.assign(
      async (workspaceId: string) => {
        calls.push(workspaceId);
        return impl(workspaceId);
      },
      { set: (fn: typeof impl) => (impl = fn) },
    ),
    revokeReviewLinkCalls: calls,
    ReviewLinkNotFoundError: class ReviewLinkNotFoundError extends Error {
      constructor(message = "No active review link exists for this workspace.") {
        super(message);
        this.name = "ReviewLinkNotFoundError";
      }
    },
  };
});

const { regenerateReviewLink, regenerateReviewLinkCalls } = vi.hoisted(() => {
  let impl: (workspaceId: string) => Promise<{ rawToken: string; expiresAt: string | null }> = async () => ({
    rawToken: "tok",
    expiresAt: null,
  });
  const calls: string[] = [];
  return {
    regenerateReviewLink: Object.assign(
      async (workspaceId: string) => {
        calls.push(workspaceId);
        return impl(workspaceId);
      },
      { set: (fn: typeof impl) => (impl = fn) },
    ),
    regenerateReviewLinkCalls: calls,
  };
});

vi.mock("@/data-access/review-links", () => ({
  createReviewLink,
  ReviewLinkNotEligibleError,
  revokeReviewLink,
  regenerateReviewLink,
  ReviewLinkNotFoundError,
}));

const { cancelOwnedWorkspace, cancelOwnedWorkspaceCalls, InvalidStatusTransitionError } = vi.hoisted(() => {
  let impl: (workspaceId: string) => Promise<void> = async () => {};
  const calls: string[] = [];
  return {
    cancelOwnedWorkspace: Object.assign(
      async (workspaceId: string) => {
        calls.push(workspaceId);
        return impl(workspaceId);
      },
      { set: (fn: typeof impl) => (impl = fn) },
    ),
    cancelOwnedWorkspaceCalls: calls,
    InvalidStatusTransitionError: class InvalidStatusTransitionError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "InvalidStatusTransitionError";
      }
    },
  };
});
vi.mock("@/data-access/workspaces", () => ({ cancelOwnedWorkspace, InvalidStatusTransitionError }));

const {
  addCreatorReviewComment,
  addCreatorReviewCommentCalls,
  resolveReviewComment,
  resolveReviewCommentCalls,
  CommentValidationError,
  CommentNotFoundError,
} = vi.hoisted(() => {
  interface CreatedComment {
    id: string;
    parentId: string | null;
    authorType: "CREATOR" | "CLIENT";
    authorName: string;
    body: string;
    status: "OPEN";
    createdAt: string;
  }
  let replyImpl: (workspaceId: string, input: { body: string; parentId?: string }) => Promise<CreatedComment> =
    async (_workspaceId, input) => ({
      id: "cmt_new",
      parentId: input.parentId ?? null,
      authorType: "CREATOR",
      authorName: "Arjun Raj",
      body: input.body,
      status: "OPEN",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  const replyCalls: { workspaceId: string; parentId?: string; body: string }[] = [];

  let resolveImpl: (commentId: string, workspaceId?: string) => Promise<void> = async () => {};
  const resolveCalls: { commentId: string; workspaceId?: string }[] = [];

  return {
    addCreatorReviewComment: Object.assign(
      async (workspaceId: string, input: { body: string; parentId?: string }) => {
        replyCalls.push({ workspaceId, parentId: input.parentId, body: input.body });
        return replyImpl(workspaceId, input);
      },
      { set: (fn: typeof replyImpl) => (replyImpl = fn) },
    ),
    addCreatorReviewCommentCalls: replyCalls,
    resolveReviewComment: Object.assign(
      async (commentId: string, workspaceId?: string) => {
        resolveCalls.push({ commentId, workspaceId });
        return resolveImpl(commentId, workspaceId);
      },
      { set: (fn: typeof resolveImpl) => (resolveImpl = fn) },
    ),
    resolveReviewCommentCalls: resolveCalls,
    CommentValidationError: class CommentValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CommentValidationError";
      }
    },
    CommentNotFoundError: class CommentNotFoundError extends Error {
      constructor(message = "This comment could not be found.") {
        super(message);
        this.name = "CommentNotFoundError";
      }
    },
  };
});
vi.mock("@/data-access/review-comments", () => ({
  addCreatorReviewComment,
  resolveReviewComment,
  CommentValidationError,
  CommentNotFoundError,
}));

function postRequest(url: string, origin: string | null) {
  return new NextRequest(url, {
    method: "POST",
    headers: origin ? { origin } : undefined,
  });
}

function postJson(url: string, origin: string | null, json: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { ...(origin ? { origin } : {}), "content-type": "application/json" },
    body: JSON.stringify(json),
  });
}

describe("file delete route (POST /api/workspaces/[id]/files/[fileId]/delete)", () => {
  beforeEach(() => {
    deleteOwnedFileCalls.length = 0;
    deleteOwnedFile.set(async () => {});
  });

  it("rejects a cross-origin request before touching the data layer", async () => {
    const { POST } = await import("./[id]/files/[fileId]/delete/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/files/f_1/delete", "https://evil.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", fileId: "f_1" }) });

    expect(response.status).toBe(403);
    expect(deleteOwnedFileCalls).toHaveLength(0);
  });

  it("returns 200 JSON on success", async () => {
    const { POST } = await import("./[id]/files/[fileId]/delete/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/files/f_1/delete", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", fileId: "f_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, fileId: "f_1" });
    expect(deleteOwnedFileCalls).toEqual(["f_1"]);
  });

  it("maps FileNotDeletableError to a safe 422 without leaking internals", async () => {
    deleteOwnedFile.set(async () => {
      throw new FileNotDeletableError("Files cannot be removed once a workspace is paid.");
    });
    const { POST } = await import("./[id]/files/[fileId]/delete/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/files/f_1/delete", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", fileId: "f_1" }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/paid/i);
  });

  it("maps OwnershipError to a generic 404 (never reveals another creator's file exists)", async () => {
    deleteOwnedFile.set(async () => {
      throw new OwnershipError();
    });
    const { POST } = await import("./[id]/files/[fileId]/delete/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/files/f_1/delete", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", fileId: "f_1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("This file could not be found.");
  });
});

describe("review-link create route (POST /api/workspaces/[id]/review-link)", () => {
  beforeEach(() => {
    createReviewLinkCalls.length = 0;
    createReviewLink.set(async () => ({ rawToken: "tok", expiresAt: null }));
  });

  it("rejects a cross-origin request", async () => {
    const { POST } = await import("./[id]/review-link/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link", "https://evil.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });

    expect(response.status).toBe(403);
    expect(createReviewLinkCalls).toHaveLength(0);
  });

  it("returns the one-time raw link with a no-store header on success", async () => {
    createReviewLink.set(async () => ({ rawToken: "tok_abc123", expiresAt: null }));
    const { POST } = await import("./[id]/review-link/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rawLink).toBe("/review/tok_abc123");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps ReviewLinkNotEligibleError to a safe 422", async () => {
    createReviewLink.set(async () => {
      throw new ReviewLinkNotEligibleError("Upload at least one file before creating a review link.");
    });
    const { POST } = await import("./[id]/review-link/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/upload at least one file/i);
  });
});

describe("review-link revoke route (POST /api/workspaces/[id]/review-link/revoke)", () => {
  beforeEach(() => {
    revokeReviewLinkCalls.length = 0;
    revokeReviewLink.set(async () => {});
  });

  it("rejects a cross-origin request before touching the data layer", async () => {
    const { POST } = await import("./[id]/review-link/revoke/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/revoke", "https://evil.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });

    expect(response.status).toBe(403);
    expect(revokeReviewLinkCalls).toHaveLength(0);
  });

  it("returns a generic success message with a no-store header", async () => {
    const { POST } = await import("./[id]/review-link/revoke/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/revoke", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, message: "Review link revoked." });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(revokeReviewLinkCalls).toEqual(["ws_1"]);
  });

  it("returns 401 for an unauthenticated request (redirect-shaped auth error)", async () => {
    revokeReviewLink.set(async () => {
      const err = new Error("redirect") as Error & { digest: string };
      err.digest = "NEXT_REDIRECT;replace;/login;307;";
      throw err;
    });
    const { POST } = await import("./[id]/review-link/revoke/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/revoke", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required.");
  });

  it("maps OwnershipError to a generic 404 (never reveals another creator's workspace exists)", async () => {
    revokeReviewLink.set(async () => {
      throw new OwnershipError();
    });
    const { POST } = await import("./[id]/review-link/revoke/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/revoke", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("This workspace could not be found.");
  });

  it("maps ReviewLinkNotFoundError to a safe 404 without leaking internals", async () => {
    revokeReviewLink.set(async () => {
      throw new ReviewLinkNotFoundError();
    });
    const { POST } = await import("./[id]/review-link/revoke/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/revoke", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("No active review link exists for this workspace.");
  });

  it("reduces an unmapped internal error to the generic 500 message", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    revokeReviewLink.set(async () => {
      throw new Error("connection reset by peer at 10.0.4.2:5432");
    });
    const { POST } = await import("./[id]/review-link/revoke/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/revoke", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(body.error).not.toMatch(/10\.0\.4\.2/);
    consoleErrorSpy.mockRestore();
  });
});

describe("review-link regenerate route (POST /api/workspaces/[id]/review-link/regenerate)", () => {
  beforeEach(() => {
    regenerateReviewLinkCalls.length = 0;
    regenerateReviewLink.set(async () => ({ rawToken: "tok", expiresAt: null }));
  });

  it("rejects a cross-origin request before touching the data layer", async () => {
    const { POST } = await import("./[id]/review-link/regenerate/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/regenerate", "https://evil.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });

    expect(response.status).toBe(403);
    expect(regenerateReviewLinkCalls).toHaveLength(0);
  });

  it("returns the new one-time raw link with a no-store header on success", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    regenerateReviewLink.set(async () => ({ rawToken: "tok_new_secret_xyz", expiresAt: null }));
    const { POST } = await import("./[id]/review-link/regenerate/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/regenerate", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rawLink).toBe("/review/tok_new_secret_xyz");
    expect(body.expiresAt).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    // Diagnostics logging is off by default (SERVER_ACTION_DIAGNOSTICS unset
    // in this test run) and never includes the raw token even when enabled
    // — this asserts nothing about this request incidentally logged it.
    const loggedText = consoleLogSpy.mock.calls.map((call) => JSON.stringify(call)).join("\n");
    expect(loggedText).not.toMatch(/tok_new_secret_xyz/);
    consoleLogSpy.mockRestore();
  });

  it("maps ReviewLinkNotEligibleError to a safe 422 (invalid workspace state)", async () => {
    regenerateReviewLink.set(async () => {
      throw new ReviewLinkNotEligibleError("A cancelled workspace cannot have a review link.");
    });
    const { POST } = await import("./[id]/review-link/regenerate/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/regenerate", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/cancelled workspace/i);
  });

  it("maps OwnershipError to a generic 404 (never reveals another creator's workspace exists)", async () => {
    regenerateReviewLink.set(async () => {
      throw new OwnershipError();
    });
    const { POST } = await import("./[id]/review-link/regenerate/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/regenerate", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("This workspace could not be found.");
  });

  it("reduces an unmapped internal error to the generic 500 message", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    regenerateReviewLink.set(async () => {
      throw new Error("prisma P2002 unique constraint on tokenHash");
    });
    const { POST } = await import("./[id]/review-link/regenerate/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/review-link/regenerate", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong. Please try again.");
    consoleErrorSpy.mockRestore();
  });
});

describe("workspace cancel route (POST /api/workspaces/[id]/cancel)", () => {
  beforeEach(() => {
    cancelOwnedWorkspaceCalls.length = 0;
    cancelOwnedWorkspace.set(async () => {});
  });

  it("rejects a cross-origin request", async () => {
    const { POST } = await import("./[id]/cancel/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/cancel", "https://evil.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });

    expect(response.status).toBe(403);
    expect(cancelOwnedWorkspaceCalls).toHaveLength(0);
  });

  it("returns 200 JSON on success", async () => {
    const { POST } = await import("./[id]/cancel/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/cancel", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it("maps InvalidStatusTransitionError (e.g. already-cancelled) to a 409, idempotent-safe", async () => {
    cancelOwnedWorkspace.set(async () => {
      throw new InvalidStatusTransitionError("This workspace has already been cancelled.");
    });
    const { POST } = await import("./[id]/cancel/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/cancel", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already/i);
  });
});

describe("comment reply route (POST /api/workspaces/[id]/comments/reply)", () => {
  beforeEach(() => {
    addCreatorReviewCommentCalls.length = 0;
    addCreatorReviewComment.set(async (_workspaceId, input) => ({
      id: "cmt_new",
      parentId: input.parentId ?? null,
      authorType: "CREATOR",
      authorName: "Arjun Raj",
      body: input.body,
      status: "OPEN",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
  });

  it("rejects a cross-origin request before touching the data layer", async () => {
    const { POST } = await import("./[id]/comments/reply/route");
    const request = postJson("https://app.example.com/api/workspaces/ws_1/comments/reply", "https://evil.example.com", {
      parentId: "cmt_parent",
      body: "Sure, updating now.",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });

    expect(response.status).toBe(403);
    expect(addCreatorReviewCommentCalls).toHaveLength(0);
  });

  it("returns the persisted reply, correctly attributed to its parent, with a no-store header", async () => {
    const { POST } = await import("./[id]/comments/reply/route");
    const request = postJson("https://app.example.com/api/workspaces/ws_1/comments/reply", "https://app.example.com", {
      parentId: "cmt_parent",
      body: "Sure, updating now.",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reply.parentId).toBe("cmt_parent"); // the returned reply belongs to the correct parent
    expect(body.reply.body).toBe("Sure, updating now.");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(addCreatorReviewCommentCalls).toEqual([{ workspaceId: "ws_1", parentId: "cmt_parent", body: "Sure, updating now." }]);
  });

  it("rejects a request with no parentId before calling the data layer", async () => {
    const { POST } = await import("./[id]/comments/reply/route");
    const request = postJson("https://app.example.com/api/workspaces/ws_1/comments/reply", "https://app.example.com", {
      body: "hi",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });

    expect(response.status).toBe(400);
    expect(addCreatorReviewCommentCalls).toHaveLength(0);
  });

  it("maps CommentValidationError (e.g. cross-workspace parentId) to a safe 422", async () => {
    addCreatorReviewComment.set(async () => {
      throw new CommentValidationError("The comment being replied to could not be found.");
    });
    const { POST } = await import("./[id]/comments/reply/route");
    const request = postJson("https://app.example.com/api/workspaces/ws_1/comments/reply", "https://app.example.com", {
      parentId: "cmt_from_another_workspace",
      body: "hijack attempt",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/could not be found/i);
  });

  it("maps OwnershipError to a generic 404 (never reveals another creator's workspace exists)", async () => {
    addCreatorReviewComment.set(async () => {
      throw new OwnershipError();
    });
    const { POST } = await import("./[id]/comments/reply/route");
    const request = postJson("https://app.example.com/api/workspaces/ws_1/comments/reply", "https://app.example.com", {
      parentId: "cmt_1",
      body: "hi",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("This workspace could not be found.");
  });

  it("rejects an unauthenticated request with 401 rather than a raw redirect", async () => {
    addCreatorReviewComment.set(async () => {
      const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
      err.digest = "NEXT_REDIRECT;replace;/login;307;";
      throw err;
    });
    const { POST } = await import("./[id]/comments/reply/route");
    const request = postJson("https://app.example.com/api/workspaces/ws_1/comments/reply", "https://app.example.com", {
      parentId: "cmt_1",
      body: "hi",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1" }) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required.");
  });
});

describe("comment resolve route (POST /api/workspaces/[id]/comments/[commentId]/resolve)", () => {
  beforeEach(() => {
    resolveReviewCommentCalls.length = 0;
    resolveReviewComment.set(async () => {});
  });

  it("rejects a cross-origin request before touching the data layer", async () => {
    const { POST } = await import("./[id]/comments/[commentId]/resolve/route");
    const request = postRequest(
      "https://app.example.com/api/workspaces/ws_1/comments/cmt_1/resolve",
      "https://evil.example.com",
    );

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", commentId: "cmt_1" }) });

    expect(response.status).toBe(403);
    expect(resolveReviewCommentCalls).toHaveLength(0);
  });

  it("returns 200 JSON with a no-store header, scoping the resolve to the URL's workspace", async () => {
    const { POST } = await import("./[id]/comments/[commentId]/resolve/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/comments/cmt_1/resolve", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", commentId: "cmt_1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, message: "Comment resolved." });
    expect(response.headers.get("cache-control")).toBe("no-store");
    // Only the matching comment (scoped to this URL's workspace) is targeted.
    expect(resolveReviewCommentCalls).toEqual([{ commentId: "cmt_1", workspaceId: "ws_1" }]);
  });

  it("remains idempotent for an already-resolved comment (still a plain 200, no error)", async () => {
    resolveReviewComment.set(async () => {}); // resolveReviewComment itself no-ops for an already-resolved comment
    const { POST } = await import("./[id]/comments/[commentId]/resolve/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/comments/cmt_1/resolve", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", commentId: "cmt_1" }) });

    expect(response.status).toBe(200);
  });

  it("maps CommentNotFoundError to a generic 404 (covers both a missing comment and a cross-workspace mismatch)", async () => {
    resolveReviewComment.set(async () => {
      throw new CommentNotFoundError();
    });
    const { POST } = await import("./[id]/comments/[commentId]/resolve/route");
    const request = postRequest(
      "https://app.example.com/api/workspaces/ws_1/comments/cmt_from_another_workspace/resolve",
      "https://app.example.com",
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "ws_1", commentId: "cmt_from_another_workspace" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("This comment could not be found.");
  });

  it("maps OwnershipError to a generic 404 (never reveals another creator's workspace exists)", async () => {
    resolveReviewComment.set(async () => {
      throw new OwnershipError();
    });
    const { POST } = await import("./[id]/comments/[commentId]/resolve/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/comments/cmt_1/resolve", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", commentId: "cmt_1" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("This workspace could not be found.");
  });

  it("rejects an unauthenticated request with 401 rather than a raw redirect", async () => {
    resolveReviewComment.set(async () => {
      const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
      err.digest = "NEXT_REDIRECT;replace;/login;307;";
      throw err;
    });
    const { POST } = await import("./[id]/comments/[commentId]/resolve/route");
    const request = postRequest("https://app.example.com/api/workspaces/ws_1/comments/cmt_1/resolve", "https://app.example.com");

    const response = await POST(request, { params: Promise.resolve({ id: "ws_1", commentId: "cmt_1" }) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required.");
  });
});
