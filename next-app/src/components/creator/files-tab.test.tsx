import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesTab } from "./files-tab";
import type { WorkspaceFileListItem } from "@/data-access/files";

const { useRouter, refresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { useRouter: vi.fn(() => ({ refresh })), refresh };
});
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("@/hooks/use-file-upload-queue", () => ({
  useFileUploadQueue: () => ({ queue: [], enqueueFiles: vi.fn(), removeItem: vi.fn() }),
}));

// Avoids pulling the real Server Actions (and their next-auth/next/server
// import chain, which Vitest's plain Node resolution can't follow) into
// this polling-behavior test — see CreatorProfile's test for the same
// pattern.
vi.mock("@/actions/files", () => ({ retryFileProcessingAction: vi.fn() }));

// PHASE 7: deletion goes through an explicit fetch() (see FileCard's
// confirmDelete), not a Server Action — a controllable deferred Response so
// tests can hold a delete "pending" open across timer advances.
const deferredDelete = { resolve: (body: { success?: boolean; error?: string }) => {} };
function mockFetchOnce() {
  return new Promise<{ ok: boolean; json: () => Promise<{ success?: boolean; error?: string }> }>((resolve) => {
    deferredDelete.resolve = (body) => resolve({ ok: !body.error, json: async () => body });
  });
}

const uploadLimits = { maxFileSizeBytes: 1_000_000, maxFilesPerWorkspace: 10, maxTotalWorkspaceBytes: 10_000_000 };

function transientFile(overrides: Partial<WorkspaceFileListItem> = {}): WorkspaceFileListItem {
  return {
    id: "file-1",
    displayName: "photo.jpg",
    fileKind: "IMAGE",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    status: "PROCESSING",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    previewAvailable: false,
    width: null,
    height: null,
    processingError: null,
    attempts: 0,
    canRetry: false,
    canDelete: false,
    canUploadNewVersion: false,
    currentVersionNumber: 1,
    pendingVersion: null,
    versions: [],
    ...overrides,
  };
}

describe("FilesTab polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("never has more than one router.refresh() scheduled at a time while a file is transient", async () => {
    render(<FilesTab workspaceId="ws_1" files={[transientFile()]} uploadLimits={uploadLimits} canUpload deliveryMode="APPROVAL_ONLY" />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops polling once no transient files remain", async () => {
    const { rerender } = render(
      <FilesTab workspaceId="ws_1" files={[transientFile()]} uploadLimits={uploadLimits} canUpload deliveryMode="APPROVAL_ONLY" />,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(<FilesTab workspaceId="ws_1" files={[transientFile({ status: "READY" })]} uploadLimits={uploadLimits} canUpload deliveryMode="APPROVAL_ONLY" />);
    refresh.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops polling on unmount instead of leaking a pending timer", async () => {
    const { unmount } = render(
      <FilesTab workspaceId="ws_1" files={[transientFile()]} uploadLimits={uploadLimits} canUpload deliveryMode="APPROVAL_ONLY" />,
    );
    unmount();
    refresh.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("pauses polling while a file's delete mutation is pending, so it can't clobber the delete's own revalidated tree", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => mockFetchOnce());

    // A second, already-transient file keeps shouldPoll true throughout,
    // independent of the file actually being deleted.
    render(
      <FilesTab
        workspaceId="ws_1"
        files={[transientFile({ id: "file-1", canDelete: true }), transientFile({ id: "file-2" })]}
        uploadLimits={uploadLimits}
        canUpload
        deliveryMode="APPROVAL_ONLY"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /remove file/i }));
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/files/file-1/delete", { method: "POST" });

    refresh.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      deferredDelete.resolve({ success: true });
    });
    // confirmDelete calls router.refresh() itself right after the fetch
    // resolves (PHASE 7 explicit reconciliation) — independent of polling.
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
