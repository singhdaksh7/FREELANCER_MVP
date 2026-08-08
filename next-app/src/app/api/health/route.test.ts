import { describe, expect, it, vi } from "vitest";

const { queryRawMock, getStorageConfigMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  getStorageConfigMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRawMock },
}));
vi.mock("@/storage/storage-config", () => ({
  getStorageConfig: getStorageConfigMock,
}));

describe("GET /api/health", () => {
  it("returns 200 with only coarse status flags when everything is reachable", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    getStorageConfigMock.mockReturnValue({ bucket: "real-bucket", accessKeyId: "real-key" });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      application: "available",
      database: "reachable",
      storage: "configured",
      demoWorkers: "not_configured",
      revision: "unknown",
    });
  });

  it("returns 503 without leaking the underlying error when the database is unreachable", async () => {
    queryRawMock.mockRejectedValue(new Error("password authentication failed for user \"real-db-user\""));
    getStorageConfigMock.mockReturnValue({ bucket: "real-bucket", accessKeyId: "real-key" });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unreachable");
    expect(text).not.toContain("real-db-user");
    expect(text).not.toContain("password");
  });

  it("returns 503 without leaking bucket/credential details when storage is misconfigured", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    getStorageConfigMock.mockImplementation(() => {
      throw new Error("Missing required environment variable: S3_BUCKET (bucket=super-secret-bucket)");
    });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.storage).toBe("misconfigured");
    expect(text).not.toContain("super-secret-bucket");
  });

  it("reports demo worker architecture only when APP_ENV=demo and DEMO_COMBINED_PROCESS=true", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    getStorageConfigMock.mockReturnValue({});
    const originalAppEnv = process.env.APP_ENV;
    const originalCombined = process.env.DEMO_COMBINED_PROCESS;
    process.env.APP_ENV = "demo";
    process.env.DEMO_COMBINED_PROCESS = "true";

    try {
      const { GET } = await import("./route");
      const response = await GET();
      const body = await response.json();
      expect(body.demoWorkers).toBe("configured");
    } finally {
      if (originalAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = originalAppEnv;
      if (originalCombined === undefined) delete process.env.DEMO_COMBINED_PROCESS;
      else process.env.DEMO_COMBINED_PROCESS = originalCombined;
    }
  });
});
