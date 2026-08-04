import { describe, expect, it, vi } from "vitest";

const {
  createWorkspaceDraft,
  finalizeWorkspaceDraft,
  OwnershipError,
  WorkspaceNotDraftError,
} = vi.hoisted(() => {
  class OwnershipError extends Error {}
  class WorkspaceNotDraftError extends Error {
    constructor(message = "This workspace can no longer be edited as a draft.") {
      super(message);
    }
  }
  return {
    createWorkspaceDraft: vi.fn(),
    finalizeWorkspaceDraft: vi.fn(),
    OwnershipError,
    WorkspaceNotDraftError,
  };
});

vi.mock("@/data-access/workspaces", () => ({
  createWorkspace: vi.fn(),
  createWorkspaceDraft,
  finalizeWorkspaceDraft,
  updateOwnedWorkspace: vi.fn(),
  cancelOwnedWorkspace: vi.fn(),
  closeWorkspaceForReview: vi.fn(),
  deleteOwnedDraftWorkspace: vi.fn(),
  InvalidStatusTransitionError: class InvalidStatusTransitionError extends Error {},
  WorkspaceNotDeletableError: class WorkspaceNotDeletableError extends Error {},
  WorkspaceNotDraftError,
}));
vi.mock("@/data-access/authorization", () => ({ OwnershipError }));
vi.mock("@/data-access/delivery-release", () => ({
  releaseApprovedFiles: vi.fn(),
  WorkspaceNotReleasableError: class WorkspaceNotReleasableError extends Error {},
  NoApprovalFoundError: class NoApprovalFoundError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class FakeRedirectSignal extends Error {}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new FakeRedirectSignal(url);
  }),
}));

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createWorkspaceDraftAction", () => {
  it("returns field errors for a missing title/client name without calling createWorkspaceDraft", async () => {
    const { createWorkspaceDraftAction } = await import("./workspaces");

    const result = await createWorkspaceDraftAction({}, formData({ title: "", clientName: "" }));

    expect(result.fieldErrors?.title).toBeDefined();
    expect(result.fieldErrors?.clientName).toBeDefined();
    expect(createWorkspaceDraft).not.toHaveBeenCalled();
  });

  it("creates a draft and returns its id without redirecting", async () => {
    createWorkspaceDraft.mockResolvedValueOnce({ id: "ws_new_draft" });
    const { createWorkspaceDraftAction } = await import("./workspaces");

    const result = await createWorkspaceDraftAction(
      {},
      formData({ title: "Brand Refresh", clientName: "Acme Co" }),
    );

    expect(result.workspaceId).toBe("ws_new_draft");
    expect(result.error).toBeUndefined();
  });

  it("surfaces a friendly error and never a raw exception when creation fails unexpectedly", async () => {
    createWorkspaceDraft.mockRejectedValueOnce(new Error("db exploded"));
    const { createWorkspaceDraftAction } = await import("./workspaces");

    const result = await createWorkspaceDraftAction(
      {},
      formData({ title: "Brand Refresh", clientName: "Acme Co" }),
    );

    expect(result.error).toBe("Something went wrong. Please try again.");
    expect(result.workspaceId).toBeUndefined();
  });
});

describe("finalizeWorkspaceDraftAction", () => {
  const validFields = {
    workspaceId: "ws_draft_1",
    title: "Brand Refresh",
    clientName: "Acme Co",
    deliveryMode: "PAYMENT_REQUIRED",
    currency: "INR",
    amount: "15000",
  };

  it("returns field errors without finalizing when the amount is missing for PAYMENT_REQUIRED", async () => {
    const { finalizeWorkspaceDraftAction } = await import("./workspaces");

    const result = await finalizeWorkspaceDraftAction(
      {},
      formData({ ...validFields, amount: "" }),
    );

    expect(result.fieldErrors?.amount).toBeDefined();
    expect(finalizeWorkspaceDraft).not.toHaveBeenCalled();
  });

  it("redirects to the finished workspace on success, and never creates a second workspace", async () => {
    finalizeWorkspaceDraft.mockResolvedValueOnce({ id: "ws_draft_1" });
    const { finalizeWorkspaceDraftAction } = await import("./workspaces");

    await expect(finalizeWorkspaceDraftAction({}, formData(validFields))).rejects.toThrow(FakeRedirectSignal);

    expect(finalizeWorkspaceDraft).toHaveBeenCalledTimes(1);
    expect(finalizeWorkspaceDraft).toHaveBeenCalledWith("ws_draft_1", expect.objectContaining({ title: "Brand Refresh" }));
  });

  it("keeps the user on the wizard (no redirect) and shows a friendly message when the draft is no longer editable", async () => {
    finalizeWorkspaceDraft.mockRejectedValueOnce(new WorkspaceNotDraftError());
    const { finalizeWorkspaceDraftAction } = await import("./workspaces");

    const result = await finalizeWorkspaceDraftAction({}, formData(validFields));

    expect(result.error).toBeDefined();
  });

  it("keeps the user on the wizard for an ownership failure (stale/foreign draft id) instead of redirecting", async () => {
    finalizeWorkspaceDraft.mockRejectedValueOnce(new OwnershipError());
    const { finalizeWorkspaceDraftAction } = await import("./workspaces");

    const result = await finalizeWorkspaceDraftAction({}, formData(validFields));

    expect(result.error).toBe("This workspace could not be found.");
  });
});
