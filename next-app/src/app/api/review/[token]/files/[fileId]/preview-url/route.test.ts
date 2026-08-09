import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeReviewToken = vi.hoisted(() => vi.fn());
vi.mock("@/data-access/review-auth", () => ({
  authorizeReviewToken,
  InvalidReviewTokenError: class InvalidReviewTokenError extends Error {},
  ReviewLinkExpiredError: class ReviewLinkExpiredError extends Error {},
  ReviewLinkRevokedError: class ReviewLinkRevokedError extends Error {},
  WorkspaceUnavailableError: class WorkspaceUnavailableError extends Error {},
}));

const findFirstWorkspaceFile = vi.hoisted(() => vi.fn());
const findFirstFileVersion = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceFile: { findFirst: findFirstWorkspaceFile },
    fileVersion: { findFirst: findFirstFileVersion },
  },
}));

const createPreviewPresignedUrl = vi.hoisted(() => vi.fn(async () => "https://storage.example/signed-preview"));
vi.mock("@/storage/signed-urls", () => ({ createPreviewPresignedUrl }));

function makeRequest(url: string) {
  return new NextRequest(url);
}

/**
 * The public /review/[token] portal's preview-url route — this is the
 * exact endpoint the client review page calls, so the locked-response
 * copy here must match the creator-side route's mode-aware copy
 * (see the sibling test at
 * src/app/api/workspaces/[id]/files/[fileId]/preview-url/route.test.ts)
 * for the two surfaces to behave consistently.
 */
describe("public review-token preview-url route (GET /api/review/[token]/files/[fileId]/preview-url)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeReviewToken.mockResolvedValue({
      workspaceId: "ws_1",
      workspace: { deliveryMode: "APPROVAL_ONLY" },
    });
  });

  it("returns a locked response for ARCHIVE files with APPROVAL_ONLY copy that never mentions payment", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "ARCHIVE",
      displayName: "assets.zip",
      sizeBytes: BigInt(2048),
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_1",
      versionNumber: 1,
      status: "READY",
      previewStorageKey: null,
      submittedAt: new Date(),
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ token: "tok_1", fileId: "f_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.locked).toBe(true);
    expect(body.message).toBe(
      "Preview is not available for this file type. The original remains protected until approval is confirmed.",
    );
    expect(body.message.toLowerCase()).not.toContain("payment");
    expect(createPreviewPresignedUrl).not.toHaveBeenCalled();
  });

  it("locked-response copy mentions payment for a PAYMENT_REQUIRED workspace", async () => {
    authorizeReviewToken.mockResolvedValue({
      workspaceId: "ws_1",
      workspace: { deliveryMode: "PAYMENT_REQUIRED" },
    });
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "ARCHIVE",
      displayName: "assets.zip",
      sizeBytes: BigInt(2048),
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_1",
      versionNumber: 1,
      status: "READY",
      previewStorageKey: null,
      submittedAt: new Date(),
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ token: "tok_1", fileId: "f_1" }),
    });
    const body = await response.json();

    expect(body.message).toBe(
      "Preview is not available for this file type. The original remains protected until approval and payment are confirmed.",
    );
  });

  it("a READY PDF with a generated preview resolves a presigned URL, not the locked branch", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "PDF",
      displayName: "brief.pdf",
      sizeBytes: BigInt(4096),
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_1",
      versionNumber: 1,
      status: "READY",
      previewStorageKey: "previews/v_1.jpg",
      submittedAt: new Date(),
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ token: "tok_1", fileId: "f_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.locked).toBeUndefined();
    expect(body.url).toBe("https://storage.example/signed-preview");
  });

  it("a PDF still processing (no preview yet) returns 409, never the locked branch", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "PDF",
      displayName: "brief.pdf",
      sizeBytes: BigInt(4096),
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_1",
      versionNumber: 1,
      status: "PROCESSING",
      previewStorageKey: null,
      submittedAt: new Date(),
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ token: "tok_1", fileId: "f_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.locked).toBeUndefined();
  });

  it("never resolves an unsubmitted version, even for a previewable kind", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "IMAGE",
      displayName: "photo.jpg",
      sizeBytes: BigInt(2048),
    });
    findFirstFileVersion.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ token: "tok_1", fileId: "f_1" }),
    });

    expect(response.status).toBe(404);
    expect(findFirstFileVersion).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ submittedAt: { not: null } }) }),
    );
  });
});
