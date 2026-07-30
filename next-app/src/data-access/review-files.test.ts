import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  workspaceFile: { findMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

const CONTEXT = {
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

describe("getReviewableFiles — submitted-version filtering", () => {
  it("excludes a file with zero submitted versions entirely", async () => {
    const { getReviewableFiles } = await import("./review-files");
    // Prisma's `where: { versions: { some: {...} } }` filter isn't executed
    // by this mock, so simulate its effect: a file with no matching rows
    // returns an empty `versions` array from the include.
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      { id: "file_1", displayName: "Draft.png", fileKind: "IMAGE", mimeType: "image/png", sizeBytes: BigInt(100), versions: [] },
    ]);

    const files = await getReviewableFiles(CONTEXT);
    expect(files).toEqual([]);
  });

  it("only includes versions with submittedAt set, using the highest submitted versionNumber as current", async () => {
    const { getReviewableFiles } = await import("./review-files");
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "Logo.png",
        fileKind: "IMAGE",
        mimeType: "image/png",
        sizeBytes: BigInt(2048),
        versions: [
          { id: "ver_1", versionNumber: 1, submittedAt: new Date("2026-07-20"), status: "READY", previewStorageKey: "previews/a.jpg" },
          { id: "ver_2", versionNumber: 2, submittedAt: new Date("2026-07-25"), status: "READY", previewStorageKey: "previews/b.jpg" },
        ],
      },
    ]);

    const files = await getReviewableFiles(CONTEXT);
    expect(files).toHaveLength(1);
    expect(files[0].currentVersionId).toBe("ver_2");
    expect(files[0].versions.map((v) => v.versionNumber)).toEqual([1, 2]);
  });

  it("never includes original storage keys in the returned shape", async () => {
    const { getReviewableFiles } = await import("./review-files");
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "Logo.png",
        fileKind: "IMAGE",
        mimeType: "image/png",
        sizeBytes: BigInt(2048),
        versions: [
          {
            id: "ver_1",
            versionNumber: 1,
            submittedAt: new Date(),
            status: "READY",
            previewStorageKey: "previews/a.jpg",
            originalStorageKey: "originals/should-never-appear.jpg",
          },
        ],
      },
    ]);

    const files = await getReviewableFiles(CONTEXT);
    expect(JSON.stringify(files)).not.toContain("originals/");
    expect(JSON.stringify(files)).not.toContain("originalStorageKey");
  });

  it("marks a version's preview as not ready when status isn't READY, even if submitted", async () => {
    const { getReviewableFiles } = await import("./review-files");
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      {
        id: "file_1",
        displayName: "Logo.png",
        fileKind: "IMAGE",
        mimeType: "image/png",
        sizeBytes: BigInt(2048),
        versions: [{ id: "ver_1", versionNumber: 1, submittedAt: new Date(), status: "PROCESSING", previewStorageKey: null }],
      },
    ]);

    const files = await getReviewableFiles(CONTEXT);
    expect(files[0].versions[0].previewReady).toBe(false);
  });

  it("scopes the query to the token's own workspace only", async () => {
    const { getReviewableFiles } = await import("./review-files");
    prismaMock.workspaceFile.findMany.mockResolvedValue([]);

    await getReviewableFiles(CONTEXT);

    expect(prismaMock.workspaceFile.findMany.mock.calls[0][0].where.workspaceId).toBe("ws_1");
  });
});
