import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  changeRequest: { findFirst: vi.fn(), update: vi.fn() },
  workspaceFile: { findMany: vi.fn() },
  workspace: { update: vi.fn() },
  fileVersion: { updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/data-access/authorization", () => ({
  requireOwnedWorkspace: vi.fn().mockResolvedValue({
    creator: { id: "usr_1", name: "Arjun Raj" },
    workspace: { id: "ws_1", status: "CHANGES_REQUESTED" },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prismaMock));
});

const REQUESTED_AT = new Date("2026-07-20T00:00:00Z");

function file(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "file_1",
    pendingVersionId: null,
    currentVersion: { id: "ver_2", status: "READY", createdAt: new Date("2026-07-25T00:00:00Z"), submittedAt: null },
    ...overrides,
  };
}

describe("submitRevision — readiness rules", () => {
  it("refuses when the workspace isn't CHANGES_REQUESTED", async () => {
    const { requireOwnedWorkspace } = await import("@/data-access/authorization");
    vi.mocked(requireOwnedWorkspace).mockResolvedValueOnce({
      creator: { id: "usr_1", name: "Arjun Raj" } as never,
      workspace: { id: "ws_1", status: "IN_REVIEW" } as never,
    });
    const { submitRevision, RevisionNotReadyError } = await import("./revisions");

    await expect(submitRevision("ws_1")).rejects.toBeInstanceOf(RevisionNotReadyError);
  });

  it("refuses when there is no open change request", async () => {
    const { submitRevision, RevisionNotReadyError } = await import("./revisions");
    prismaMock.changeRequest.findFirst.mockResolvedValue(null);

    await expect(submitRevision("ws_1")).rejects.toBeInstanceOf(RevisionNotReadyError);
  });

  it("refuses when a file still has a processing or failed pending version", async () => {
    const { submitRevision, RevisionNotReadyError } = await import("./revisions");
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_1", requestedAt: REQUESTED_AT });
    prismaMock.workspaceFile.findMany.mockResolvedValue([file({ pendingVersionId: "ver_3" })]);

    await expect(submitRevision("ws_1")).rejects.toBeInstanceOf(RevisionNotReadyError);
    expect(prismaMock.changeRequest.update).not.toHaveBeenCalled();
  });

  it("refuses when no version is newer than the active change request", async () => {
    const { submitRevision, RevisionNotReadyError } = await import("./revisions");
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_1", requestedAt: new Date("2026-08-01T00:00:00Z") });
    prismaMock.workspaceFile.findMany.mockResolvedValue([file()]);

    await expect(submitRevision("ws_1")).rejects.toBeInstanceOf(RevisionNotReadyError);
  });

  it("submits successfully: marks new versions submitted, resolves the change request, and moves the workspace back to IN_REVIEW", async () => {
    const { submitRevision } = await import("./revisions");
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_1", requestedAt: REQUESTED_AT });
    prismaMock.workspaceFile.findMany.mockResolvedValue([file()]);

    await submitRevision("ws_1");

    expect(prismaMock.fileVersion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["ver_2"] } },
      data: { submittedAt: expect.any(Date) },
    });
    expect(prismaMock.changeRequest.update.mock.calls[0][0].data.status).toBe("RESOLVED");
    expect(prismaMock.workspace.update.mock.calls[0][0].data.status).toBe("IN_REVIEW");
    expect(prismaMock.activityLog.create.mock.calls[0][0].data.action).toBe("REVISION_SUBMITTED");
  });

  it("does not re-mark an already-submitted current version", async () => {
    const { submitRevision } = await import("./revisions");
    prismaMock.changeRequest.findFirst.mockResolvedValue({ id: "cr_1", requestedAt: REQUESTED_AT });
    prismaMock.workspaceFile.findMany.mockResolvedValue([
      file({ currentVersion: { id: "ver_2", status: "READY", createdAt: new Date("2026-07-25T00:00:00Z"), submittedAt: new Date() } }),
      file({ id: "file_2", currentVersion: { id: "ver_9", status: "READY", createdAt: new Date("2026-07-26T00:00:00Z"), submittedAt: null } }),
    ]);

    await submitRevision("ws_1");

    expect(prismaMock.fileVersion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["ver_9"] } },
      data: { submittedAt: expect.any(Date) },
    });
  });
});
