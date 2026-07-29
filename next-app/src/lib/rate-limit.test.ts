import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  rateLimitAttempt: {
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.rateLimitAttempt.deleteMany.mockResolvedValue({ count: 0 });
});

describe("checkRateLimit", () => {
  it("allows a request under the limit and records the attempt", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    prismaMock.rateLimitAttempt.count.mockResolvedValue(2);

    await expect(checkRateLimit({ bucket: "test-bucket", identifier: "tok_abc", max: 5, windowSeconds: 60 })).resolves.toBeUndefined();
    expect(prismaMock.rateLimitAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitExceededError once the limit is reached, without recording another attempt", async () => {
    const { checkRateLimit, RateLimitExceededError } = await import("./rate-limit");
    prismaMock.rateLimitAttempt.count.mockResolvedValue(5);

    await expect(checkRateLimit({ bucket: "test-bucket", identifier: "tok_abc", max: 5, windowSeconds: 60 })).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(prismaMock.rateLimitAttempt.create).not.toHaveBeenCalled();
  });

  it("never stores the raw identifier — only a hash", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    prismaMock.rateLimitAttempt.count.mockResolvedValue(0);

    await checkRateLimit({ bucket: "test-bucket", identifier: "a-very-secret-raw-token-value", max: 5, windowSeconds: 60 });

    const createCall = prismaMock.rateLimitAttempt.create.mock.calls[0][0];
    expect(createCall.data.identifierHash).not.toContain("a-very-secret-raw-token-value");
    expect(createCall.data.identifierHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("scopes the same identifier differently per bucket", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    prismaMock.rateLimitAttempt.count.mockResolvedValue(0);

    await checkRateLimit({ bucket: "bucket-a", identifier: "same-id", max: 5, windowSeconds: 60 });
    await checkRateLimit({ bucket: "bucket-b", identifier: "same-id", max: 5, windowSeconds: 60 });

    const hashA = prismaMock.rateLimitAttempt.create.mock.calls[0][0].data.identifierHash;
    const hashB = prismaMock.rateLimitAttempt.create.mock.calls[1][0].data.identifierHash;
    expect(hashA).not.toBe(hashB);
  });
});

describe("networkScopedIp", () => {
  it("truncates an IPv4 address to its /24 network", async () => {
    const { networkScopedIp } = await import("./rate-limit");
    expect(networkScopedIp("203.0.113.42")).toBe("203.0.113.0");
  });

  it("truncates an IPv6 address to its first 3 hextets", async () => {
    const { networkScopedIp } = await import("./rate-limit");
    expect(networkScopedIp("2001:db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:db8:85a3");
  });
});
