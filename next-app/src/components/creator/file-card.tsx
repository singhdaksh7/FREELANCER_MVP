"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, File as FileIcon, FileArchive, RefreshCw, Eye, Lock, UploadCloud } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { retryFileProcessingAction, deleteFileAction, type FileActionState } from "@/actions/files";
import { formatBytes } from "@/lib/bytes";
import { isSupportedMimeType } from "@/lib/file-kind";
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

      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50">
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
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export interface FileCardProps {
  file: WorkspaceFileListItem;
  workspaceId: string;
}

/** One uploaded file's card: identity, status, protected preview (image-only), version history, retry/remove/upload-new-version actions. */
export function FileCard({ file, workspaceId }: FileCardProps) {
  const [retryState, retryAction, retryPending] = useActionState(retryFileProcessingAction, initialRetryState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function openPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await fetch(`/api/files/${file.id}/preview-url`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Preview unavailable.");
      setPreviewUrl(data.url);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview unavailable.");
    } finally {
      setPreviewLoading(false);
    }
  }

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
        <StatusBadge status={STATUS_LABELS[file.status] ?? file.status} />
      </div>

      {file.status === "READY" && file.previewAvailable && (
        <div className="flex flex-col gap-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed S3/MinIO URL, not a next/image-optimizable static asset
            <img
              src={previewUrl}
              alt={`Protected preview of ${file.displayName}`}
              className="max-h-56 w-full rounded-md border border-line bg-slate-50 object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={openPreview}
              disabled={previewLoading}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Eye size={14} aria-hidden="true" /> {previewLoading ? "Loading preview…" : "View Protected Preview"}
            </button>
          )}
          {previewError && <p className="text-xs font-medium text-danger">{previewError}</p>}
        </div>
      )}

      {file.status === "READY" && !file.previewAvailable && (
        <p className="flex items-center gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-muted">
          <Lock size={13} aria-hidden="true" /> Locked original — preview not available in this MVP.
        </p>
      )}

      {file.status === "FAILED" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-danger">{file.processingError ?? "Processing failed."}</p>
          {retryState.error && <p className="text-xs font-medium text-danger">{retryState.error}</p>}
          {file.canRetry ? (
            <form action={retryAction}>
              <input type="hidden" name="fileId" value={file.id} />
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <button
                type="submit"
                disabled={retryPending}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
          <ConfirmDialog
            triggerLabel="Remove"
            triggerClassName="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            title={`Remove ${file.displayName}?`}
            description="This permanently removes the file from this workspace."
            confirmLabel="Remove File"
            pendingLabel="Removing…"
            action={deleteFileAction}
            initialState={{}}
            hiddenFields={{ fileId: file.id, workspaceId }}
            destructive
          />
        ) : (
          <span className="text-xs text-ink-muted">Locked — cannot be removed</span>
        )}
      </div>
    </div>
  );
}
