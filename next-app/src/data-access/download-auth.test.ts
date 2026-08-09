import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateDownloadToken, hashDownloadToken } from "@/lib/download-token";

const prismaMock = {
  downloadGrant: { findUnique: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

const BASE_GRANT = {
  id: "grant_1",
  workspaceId: "ws_1",
  paymentId: "pay_1",
  approvalId: "appr_1",
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 60_000),
  maxDownloads: 5,
  downloadCount: 0,
  workspace: { title: "Brand Identity Design", creator: { name: "Arjun Raj" } },
  payment: { id: "pay_1", gatewayPaymentId: "pay_gw_1" },
  approval: { deliveryBundle: { status: "READY" } },
  files: [],
};

describe("authorizeDownloadGrant", () => {
  it("rejects a malformed token before any database access", async () => {
    const { authorizeDownloadGrant, InvalidDownloadTokenError } = await import("./download-auth");
    await expect(authorizeDownloadGrant("too-short")).rejects.toBeInstanceOf(InvalidDownloadTokenError);
    expect(prismaMock.downloadGrant.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown token hash", async () => {
    const { authorizeDownloadGrant, InvalidDownloadTokenError } = await import("./download-auth");
    prismaMock.downloadGrant.findUnique.mockResolvedValue(null);
    await expect(authorizeDownloadGrant(generateDownloadToken())).rejects.toBeInstanceOf(InvalidDownloadTokenError);
  });

  it("rejects a REVOKED grant unconditionally", async () => {
    const { authorizeDownloadGrant, DownloadGrantRevokedError } = await import("./download-auth");
    prismaMock.downloadGrant.findUnique.mockResolvedValue({ ...BASE_GRANT, status: "REVOKED" });
    await expect(authorizeDownloadGrant(generateDownloadToken())).rejects.toBeInstanceOf(DownloadGrantRevokedError);
  });

  it("rejects an expired grant even if the stored status is still ACTIVE (lazy expiry check)", async () => {
    const { authorizeDownloadGrant, DownloadGrantExpiredError } = await import("./download-auth");
    prismaMock.downloadGrant.findUnique.mockResolvedValue({ ...BASE_GRANT, status: "ACTIVE", expiresAt: new Date(Date.now() - 1000) });
    await expect(authorizeDownloadGrant(generateDownloadToken())).rejects.toBeInstanceOf(DownloadGrantExpiredError);
  });

  it("rejects a grant that has reached its download limit even if the stored status is still ACTIVE", async () => {
    const { authorizeDownloadGrant, DownloadGrantExhaustedError } = await import("./download-auth");
    prismaMock.downloadGrant.findUnique.mockResolvedValue({ ...BASE_GRANT, status: "ACTIVE", downloadCount: 5, maxDownloads: 5 });
    await expect(authorizeDownloadGrant(generateDownloadToken())).rejects.toBeInstanceOf(DownloadGrantExhaustedError);
  });

  it("returns safe context for a valid grant — never a storage key or token hash", async () => {
    const { authorizeDownloadGrant } = await import("./download-auth");
    prismaMock.downloadGrant.findUnique.mockResolvedValue({
      ...BASE_GRANT,
      files: [{ workspaceFileId: "wf_1", fileVersionId: "fv_1", displayName: "logo.png", sizeBytes: BigInt(2048) }],
    });

    const context = await authorizeDownloadGrant(generateDownloadToken());

    expect(context.grantId).toBe("grant_1");
    expect(context.files).toEqual([{ workspaceFileId: "wf_1", fileVersionId: "fv_1", displayName: "logo.png", sizeBytes: 2048 }]);
    expect(context.bundleReady).toBe(true);
    expect(JSON.stringify(context)).not.toMatch(/storageKey|tokenHash/i);
  });

  it("looks up by the SHA-256 hash of the raw token, never the raw token itself", async () => {
    const { authorizeDownloadGrant } = await import("./download-auth");
    prismaMock.downloadGrant.findUnique.mockResolvedValue(BASE_GRANT);
    const rawToken = generateDownloadToken();

    await authorizeDownloadGrant(rawToken);

    expect(prismaMock.downloadGrant.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashDownloadToken(rawToken) },
      include: expect.any(Object),
    });
  });
});
