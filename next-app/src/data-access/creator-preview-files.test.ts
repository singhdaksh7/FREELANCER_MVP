import { describe, expect, it, vi, beforeEach } from "vitest";

const requireOwnedWorkspace = vi.fn();
vi.mock("./authorization", () => ({ requireOwnedWorkspace }));

const prismaMock = {
  workspaceFile: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnedWorkspace.mockResolvedValue({ creator: { id: "creator_1" }, workspace: { id: "ws_1" } });
});

describe("getCreatorPreviewFiles — creator Preview Client View data source", () => {
  it("enforces ownership before returning anything", async () => {
    requireOwnedWorkspace.mockRejectedValueOnce(new Error("not owned"));
    const { getCreatorPreviewFiles } = await import("./creator-preview-files");
    await expect(getCreatorPreviewFiles("ws_1")).rejects.toThrow("not owned");
    expect(prismaMock.workspaceFile.findMany).not.toHaveBeenCalled();
  });

  it("includes the current READY version even when submittedAt is null (never submitted)", async () => {
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "Fresh.jpg",
        fileKind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: BigInt(1024),
        currentVersion: {
          id: "ver_1",
          versionNumber: 1,
          status: "READY",
          previewStorageKey: "previews/a.jpg",
          submittedAt: null,
          createdAt: new Date("2026-08-01T00:00:00Z"),
        },
      },
    ]);

    const { getCreatorPreviewFiles } = await import("./creator-preview-files");
    const files = await getCreatorPreviewFiles("ws_1");

    expect(files).toHaveLength(1);
    expect(files[0].currentVersionId).toBe("ver_1");
    expect(files[0].versions[0].previewReady).toBe(true);
  });

  it("omits a file whose current version is not yet READY", async () => {
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "Processing.jpg",
        fileKind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: BigInt(1024),
        currentVersion: {
          id: "ver_1",
          versionNumber: 1,
          status: "PROCESSING",
          previewStorageKey: null,
          submittedAt: null,
          createdAt: new Date(),
        },
      },
    ]);

    const { getCreatorPreviewFiles } = await import("./creator-preview-files");
    const files = await getCreatorPreviewFiles("ws_1");
    expect(files).toEqual([]);
  });

  it("omits a file with no current version at all", async () => {
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "NoVersion.jpg",
        fileKind: "IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: BigInt(1024),
        currentVersion: null,
      },
    ]);

    const { getCreatorPreviewFiles } = await import("./creator-preview-files");
    const files = await getCreatorPreviewFiles("ws_1");
    expect(files).toEqual([]);
  });

  it("never includes original storage keys in the returned shape", async () => {
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "Logo.png",
        fileKind: "IMAGE",
        mimeType: "image/png",
        sizeBytes: BigInt(2048),
        currentVersion: {
          id: "ver_1",
          versionNumber: 1,
          status: "READY",
          previewStorageKey: "previews/a.jpg",
          originalStorageKey: "originals/should-never-appear.jpg",
          submittedAt: null,
          createdAt: new Date(),
        },
      },
    ]);

    const { getCreatorPreviewFiles } = await import("./creator-preview-files");
    const files = await getCreatorPreviewFiles("ws_1");
    expect(JSON.stringify(files)).not.toContain("originals/");
    expect(JSON.stringify(files)).not.toContain("originalStorageKey");
  });

  it("only ever exposes currentVersionId, never a pendingVersionId candidate (query excludes it entirely)", async () => {
    prismaMock.workspaceFile.findMany.mockResolvedValue([]);
    const { getCreatorPreviewFiles } = await import("./creator-preview-files");
    await getCreatorPreviewFiles("ws_1");

    const call = prismaMock.workspaceFile.findMany.mock.calls[0][0];
    expect(call.where.workspaceId).toBe("ws_1");
    expect(call.where.deletedAt).toBeNull();
    expect(call.include).toEqual({ currentVersion: true });
    expect(call.include.pendingVersion).toBeUndefined();
  });
});
