import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceActions } from "./workspace-actions";

const { useRouter, refresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { useRouter: vi.fn(() => ({ refresh })), refresh };
});
vi.mock("next/navigation", () => ({ useRouter }));

// Avoids pulling the real Server Actions (next-auth/next/server import
// chain) into this component test — delete/release/close aren't exercised.
vi.mock("@/actions/workspaces", () => ({
  deleteWorkspaceAction: vi.fn(),
  releaseFilesAction: vi.fn(),
  closeWorkspaceAction: vi.fn(),
}));

const baseProps = {
  workspaceId: "ws_1",
  workspaceTitle: "Brand Shoot",
  canCancel: true,
  canDelete: false,
  financiallyLocked: false,
};

/**
 * PHASE 7 regression coverage: cancellation used to hang on "Cancelling…"
 * forever when the Server Action's RSC response failed to apply — it now
 * goes through an explicit fetch() to POST /api/workspaces/[id]/cancel
 * (see confirmCancel in workspace-actions.tsx).
 */
describe("WorkspaceActions cancel", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears pending, hides the Cancel action, and reconciles via router.refresh() after success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<WorkspaceActions {...baseProps} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^cancel workspace$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /yes, cancel workspace/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/cancel", { method: "POST" });
    expect(screen.queryByRole("button", { name: /^cancel workspace$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/workspace cancelled/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clears pending and shows the error after a handled failure, keeping Cancel available", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This workspace has already been cancelled." }),
    });

    render(<WorkspaceActions {...baseProps} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^cancel workspace$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /yes, cancel workspace/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("already been cancelled");
    expect(screen.getByRole("button", { name: /^cancel workspace$/i })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
