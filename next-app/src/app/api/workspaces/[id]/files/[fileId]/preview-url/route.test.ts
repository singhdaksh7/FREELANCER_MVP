import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { OwnershipError } = vi.hoisted(() => ({
  OwnershipError: class OwnershipError extends Error {
    constructor(message = "Not found, or you do not have access to it.") {
      super(message);
      this.name = "OwnershipError";
    }
  },
}));

const requireOwnedWorkspace = vi.hoisted(() => vi.fn());
vi.mock("@/data-access/authorization", () => ({ requireOwnedWorkspace, OwnershipError }));

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
 * Covers the Part 1 fix: the creator-authenticated Preview Client View
 * preview-url route must show the file's *current* READY version
 * regardless of `submittedAt` (unlike the public /review/[token] route,
 * which strictly requires a submitted version) — but must never resolve
 * any version other than `currentVersionId` (never a pending re-upload
 * candidate, never an arbitrary versionId).
 */
describe("creator preview-url route (GET /api/workspaces/[id]/files/[fileId]/preview-url)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnedWorkspace.mockResolvedValue({ creator: { id: "creator_1" }, workspace: { id: "ws_1" } });
  });

  it("maps OwnershipError to a generic 404", async () => {
    requireOwnedWorkspace.mockRejectedValueOnce(new OwnershipError());
    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "ws_1", fileId: "f_1" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns the current READY version's preview even when submittedAt is null (unsubmitted upload)", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "IMAGE",
      currentVersionId: "v_current",
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_current",
      versionNumber: 1,
      status: "READY",
      previewStorageKey: "previews/v_current.jpg",
      submittedAt: null,
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "ws_1", fileId: "f_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://storage.example/signed-preview");
    expect(body.versionId).toBe("v_current");
    // Never queried with a submittedAt filter — that's the whole point of this route existing separately.
    expect(findFirstFileVersion).toHaveBeenCalledWith({ where: { id: "v_current", fileId: "f_1" } });
  });

  it("404s when the requested versionId does not match the file's current version (never exposes a pending candidate or arbitrary version)", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "IMAGE",
      currentVersionId: "v_current",
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x?versionId=v_pending_candidate"), {
      params: Promise.resolve({ id: "ws_1", fileId: "f_1" }),
    });

    expect(response.status).toBe(404);
    expect(findFirstFileVersion).not.toHaveBeenCalled();
  });

  it("404s when the file has no current version at all (e.g. still processing its first upload)", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "IMAGE",
      currentVersionId: null,
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "ws_1", fileId: "f_1" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns a locked response for non-previewable file kinds without querying storage", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "ARCHIVE",
      displayName: "assets.zip",
      sizeBytes: BigInt(1024),
      currentVersionId: "v_current",
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_current",
      versionNumber: 1,
      status: "READY",
      previewStorageKey: null,
      submittedAt: null,
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "ws_1", fileId: "f_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.locked).toBe(true);
    expect(createPreviewPresignedUrl).not.toHaveBeenCalled();
  });

  it("returns 409 while the current version is still processing", async () => {
    findFirstWorkspaceFile.mockResolvedValueOnce({
      id: "f_1",
      workspaceId: "ws_1",
      fileKind: "IMAGE",
      currentVersionId: "v_current",
    });
    findFirstFileVersion.mockResolvedValueOnce({
      id: "v_current",
      versionNumber: 1,
      status: "PROCESSING",
      previewStorageKey: null,
      submittedAt: null,
    });

    const { GET } = await import("./route");
    const response = await GET(makeRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "ws_1", fileId: "f_1" }),
    });

    expect(response.status).toBe(409);
  });
});
