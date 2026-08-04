"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, File as FileIcon, FileArchive, RefreshCw, RotateCw, UploadCloud } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmFetchDialog } from "@/components/ui/confirm-fetch-dialog";
import { LockedFileCard } from "@/components/ui/locked-file-card";
import { retryFileProcessingAction, type FileActionState } from "@/actions/files";
import { formatBytes } from "@/lib/bytes";
import { isSupportedMimeType } from "@/lib/file-kind";
import { fetchPreviewUrl } from "@/lib/preview-client";
import type { WorkspaceFileListItem } from "@/data-access/files";

const STATUS_LABELS: Record<string, string> = {
  UPLOAD_PENDING: "Pending",
  UPLOADING: "Uploading",
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
  DELETED: "Deleted",
};

const initialRetryState: FileActionState = {};
const MAX_AUTO_RETRIES = 1;

function UploadNewVersionControl({ file, workspaceId }: { file: WorkspaceFileListItem; workspaceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(selected: File) {
    setUploading(true);
    setError(null);
    try {
      if (!isSupportedMimeType(selected.type)) {
        throw new Error("This file type isn't supported.");
      }
      const sessionResponse = await fetch(`/api/workspaces/${workspaceId}/files/${file.id}/versions/upload-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: selected.name, mimeType: selected.type, sizeBytes: selected.size }),
      });
      const sessionData = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(sessionData.error ?? "Could not start this upload.");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sessionData.uploadUrl);
        xhr.setRequestHeader("Content-Type", selected.type);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed.")));
        xhr.onerror = () => reject(new Error("Upload failed. Please check your connection and try again."));
        xhr.send(selected);
      });

      const completeResponse = await fetch(`/api/upload-sessions/${sessionData.sessionId}/complete`, { method: "POST" });
      const completeData = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completeData.error ?? "This file could not be verified.");

      // Wrapped in startTransition — same pattern as FilesTab's polling
      // effect and useFileUploadQueue's own post-upload refresh, so a
      // concurrent state update can't cause Next to abort this RSC fetch.
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex min-h-[44px] w-fit cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">
        <UploadCloud size={13} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload New Version"}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void handleFile(selected);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface FileCardProps {
  file: WorkspaceFileListItem;
  workspaceId: string;
  /**
   * Reports whether this card has a mutation (retry/delete) in flight, so
   * FilesTab can pause its own router.refresh() polling while one is
   * pending — otherwise a concurrent poll-triggered refresh can race the
   * mutation's own revalidated tree and clobber it with stale data (e.g. a
   * deleted file's card reappearing because a stale refresh response landed
   * after the delete action's own update).
   */
  onMutationPendingChange?: (fileId: string, pending: boolean) => void;
  /** Removes this file from FilesTab's local list immediately after a confirmed successful deletion — see FilesTab's `deletedFileIds`. */
  onDeleted?: (fileId: string) => void;
}

/** One uploaded file's card: identity, status, protected preview (image-only), version history, retry/remove/upload-new-version actions. */
export function FileCard({ file, workspaceId, onMutationPendingChange, onDeleted }: FileCardProps) {
  const router = useRouter();
  const [retryState, retryAction, retryPending] = useActionState(retryFileProcessingAction, initialRetryState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const autoRefreshedRef = useRef(false);

  const canPreview = file.status === "READY" && file.previewAvailable;

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    const result = await fetchPreviewUrl(`/api/files`, file.id);
    setPreviewLoading(false);
    if (result.status !== "ready" || !result.url) {
      setPreviewError(result.error ?? "Preview unavailable.");
      return;
    }
    setPreviewUrl(result.url);
  }, [file.id]);

  // Preview loads automatically as soon as the file is READY with a
  // protected preview available — matches the client review portal's
  // auto-load behavior instead of requiring a manual click here too.
  useEffect(() => {
    autoRefreshedRef.current = false;
    if (canPreview) void loadPreview();
    else {
      setPreviewUrl(null);
      setPreviewError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPreview already depends on file.id
  }, [canPreview, file.currentVersionNumber]);

  function handlePreviewImageError() {
    if (autoRefreshedRef.current) {
      setPreviewUrl(null);
      setPreviewError("This preview could not be loaded.");
      return;
    }
    autoRefreshedRef.current = true;
    void loadPreview();
  }

  async function confirmDelete() {
    const response = await fetch(`/api/workspaces/${workspaceId}/files/${file.id}/delete`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data.error ?? "Something went wrong. Please try again." };
    onDeleted?.(file.id);
    router.refresh();
    return {};
  }

  const mutationPending = retryPending || deletePending;
  useEffect(() => {
    onMutationPendingChange?.(file.id, mutationPending);
    return () => onMutationPendingChange?.(file.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-report when the pending flag itself changes
  }, [mutationPending, file.id]);

  const Icon = file.fileKind === "IMAGE" ? ImageIcon : file.fileKind === "ARCHIVE" ? FileArchive : FileIcon;
  const isTransient = ["UPLOAD_PENDING", "UPLOADING", "UPLOADED", "PROCESSING"].includes(file.status);

  return (
    <div data-testid="file-card" data-file-name={file.displayName} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink" title={file.displayName}>
              {file.displayName}
            </p>
            <p className="text-xs text-ink-muted">{formatBytes(file.sizeBytes)}</p>
          </div>
        </div>
        <StatusBadge status={STATUS_LABELS[file.status] ?? file.status} data-testid="file-status" />
      </div>

      {canPreview && (
        <div className="flex flex-col gap-2">
          {previewLoading && !previewUrl && (
            <div role="status" aria-live="polite" className="flex flex-col gap-1">
              <span className="sr-only">Loading protected preview…</span>
              <div className="h-40 w-full animate-pulse rounded-md border border-line bg-slate-100" aria-hidden="true" />
            </div>
          )}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed S3/MinIO URL, not a next/image-optimizable static asset
            <img
              src={previewUrl}
              alt={`Protected preview of ${file.displayName}`}
              onError={handlePreviewImageError}
              className="max-h-56 w-full rounded-md border border-line bg-slate-50 object-contain"
            />
          )}
          {previewError && (
            <div role="alert" className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-danger">{previewError}</p>
              <button
                type="button"
                onClick={() => {
                  autoRefreshedRef.current = false;
                  void loadPreview();
                }}
                className="inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50"
              >
                <RotateCw size={13} aria-hidden="true" /> Retry
              </button>
            </div>
          )}
        </div>
      )}

      {file.status === "READY" && !file.previewAvailable && (
        <LockedFileCard message="Locked original — preview not available in this MVP." />
      )}

      {file.status === "FAILED" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-danger">{file.processingError ?? "Processing failed."}</p>
          {retryState.error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {retryState.error}
            </p>
          )}
          {file.canRetry ? (
            <form action={retryAction}>
              <input type="hidden" name="fileId" value={file.id} />
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <button
                type="submit"
                disabled={retryPending}
                className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={13} aria-hidden="true" /> {retryPending ? "Retrying…" : "Retry Processing"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-ink-muted">Retry limit reached.</p>
          )}
        </div>
      )}

      {isTransient && <p className="text-xs text-ink-muted">Processing…</p>}

      {file.versions.length > 1 && (
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer font-semibold text-ink">
            Version history ({file.versions.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {[...file.versions].reverse().map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2">
                <span>
                  v{v.versionNumber} — {v.status}
                  {v.versionNumber === file.currentVersionNumber ? " (current)" : ""}
                </span>
                <span>{v.submittedAt ? "submitted to client" : "not submitted"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {file.pendingVersion && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-muted">
          Version {file.pendingVersion.versionNumber} candidate:{" "}
          <span className="font-semibold">{file.pendingVersion.status}</span>
          {file.pendingVersion.status === "FAILED" && file.pendingVersion.processingError
            ? ` — ${file.pendingVersion.processingError}`
            : ""}
        </p>
      )}

      {file.canUploadNewVersion && <UploadNewVersionControl file={file} workspaceId={workspaceId} />}

      <div className="flex justify-end">
        {file.canDelete ? (
          <ConfirmFetchDialog
            triggerLabel="Remove"
            triggerClassName="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            title={`Remove ${file.displayName}?`}
            description="This permanently removes the file from this workspace."
            confirmLabel="Remove File"
            pendingLabel="Removing…"
            onConfirm={confirmDelete}
            onPendingChange={setDeletePending}
            destructive
          />
        ) : (
          <span className="text-xs text-ink-muted">Locked — cannot be removed</span>
        )}
      </div>
    </div>
  );
}
