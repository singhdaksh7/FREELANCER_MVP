import { describe, expect, it, vi, beforeEach } from "vitest";

const getObjectBuffer = vi.hoisted(() => vi.fn());
const putObjectBuffer = vi.hoisted(() => vi.fn());
vi.mock("../storage/s3-storage-provider", () => ({
  s3StorageProvider: { getObjectBuffer, putObjectBuffer },
}));

const { processJob } = await import("./job-processor");

interface FakeJob {
  id: string;
  attempts: number;
  fileVersion: {
    id: string;
    originalStorageKey: string;
    file: {
      id: string;
      workspaceId: string;
      displayName: string;
      fileKind: string;
      pendingVersionId: string | null;
      workspace: { creatorId: string; clientName: string; title: string };
    };
  };
}

function makeFakePrisma(job: FakeJob) {
  const calls: { fileVersionUpdates: unknown[]; workspaceFileUpdates: unknown[]; jobUpdates: unknown[]; activity: unknown[] } = {
    fileVersionUpdates: [],
    workspaceFileUpdates: [],
    jobUpdates: [],
    activity: [],
  };

  const prisma = {
    fileVersion: {
      update: vi.fn((args: unknown) => {
        calls.fileVersionUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    workspaceFile: {
      update: vi.fn((args: unknown) => {
        calls.workspaceFileUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    fileProcessingJob: {
      update: vi.fn((args: unknown) => {
        calls.jobUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    activityLog: {
      create: vi.fn((args: unknown) => {
        calls.activity.push(args);
        return Promise.resolve({});
      }),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  return { prisma, calls };
}

function makeJob(overrides: Partial<FakeJob["fileVersion"]["file"]> = {}): FakeJob {
  return {
    id: "job_1",
    attempts: 1,
    fileVersion: {
      id: "version_1",
      originalStorageKey: "originals/test.jpg",
      file: {
        id: "file_1",
        workspaceId: "ws_1",
        displayName: "test.jpg",
        fileKind: "IMAGE",
        pendingVersionId: null,
        workspace: { creatorId: "creator_1", clientName: "Test Client", title: "Test Workspace" },
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processJob — storage upload failure", () => {
  it("marks the file/version FAILED with a safe (non-raw-SDK) error when the preview upload to storage fails, and never marks it READY", async () => {
    getObjectBuffer.mockImplementation(async () => {
      const sharp = (await import("sharp")).default;
      return sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).jpeg().toBuffer();
    });
    putObjectBuffer.mockRejectedValue(new Error("S3: connection reset by peer at bucket=inlay-demo-uploads region=ap-south-1"));

    const job = makeJob();
    const { prisma, calls } = makeFakePrisma(job);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processJob(prisma as any, job as any);

    expect(calls.jobUpdates).toHaveLength(1);
    const jobUpdate = calls.jobUpdates[0] as { data: { status: string; errorMessage: string } };
    expect(jobUpdate.data.status).toBe("FAILED");
    expect(jobUpdate.data.errorMessage).not.toContain("S3");
    expect(jobUpdate.data.errorMessage).not.toContain("bucket=");
    expect(jobUpdate.data.errorMessage).not.toMatch(/ap-south-1/);

    expect(calls.fileVersionUpdates).toHaveLength(1);
    const versionUpdate = calls.fileVersionUpdates[0] as { data: { status: string } };
    expect(versionUpdate.data.status).toBe("FAILED");
    expect(versionUpdate.data.status).not.toBe("READY");

    expect(calls.workspaceFileUpdates).toHaveLength(1);
    const fileUpdate = calls.workspaceFileUpdates[0] as { data: { status: string } };
    expect(fileUpdate.data.status).toBe("FAILED");
  });
});
