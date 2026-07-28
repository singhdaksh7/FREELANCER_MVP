"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Files } from "lucide-react";
import { UploadDropzone } from "./upload-dropzone";
import { FileCard } from "./file-card";
import { useFileUploadQueue, type UploadLimits } from "@/hooks/use-file-upload-queue";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBytes } from "@/lib/bytes";
import type { WorkspaceFileListItem } from "@/data-access/files";

export interface FilesTabProps {
  workspaceId: string;
  files: WorkspaceFileListItem[];
  uploadLimits: UploadLimits;
  canUpload: boolean;
}

const TRANSIENT_STATUSES = new Set(["UPLOAD_PENDING", "UPLOADING", "UPLOADED", "PROCESSING"]);
const POLL_INTERVAL_MS = 2500;

/**
 * Replaces the Phase 4 Files-tab placeholder. Orchestrates real uploads
 * (useFileUploadQueue) and polls (router.refresh()) while any file is
 * still uploading/processing, so a creator watching the tab sees
 * PROCESSING flip to READY/FAILED without manually reloading.
 */
export function FilesTab({ workspaceId, files, uploadLimits, canUpload }: FilesTabProps) {
  const { queue, enqueueFiles, removeItem } = useFileUploadQueue(workspaceId, uploadLimits);
  const router = useRouter();

  const hasTransientFiles = files.some((file) => TRANSIENT_STATUSES.has(file.status));
  useEffect(() => {
    if (!hasTransientFiles) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasTransientFiles, router]);

  return (
    <div className="flex flex-col gap-5">
      {canUpload ? (
        <UploadDropzone
          onFilesSelected={enqueueFiles}
          acceptHint={`JPEG, PNG, WebP, PDF, or ZIP — up to ${formatBytes(uploadLimits.maxFileSizeBytes)} each`}
        />
      ) : (
        <p className="rounded-md bg-slate-50 px-3.5 py-2.5 text-sm text-ink-muted">
          This workspace has been paid, so files can no longer be added or removed.
        </p>
      )}

      {queue.length > 0 && (
        <ul className="flex flex-col gap-2">
          {queue.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{item.name}</p>
                {item.status === "error" ? (
                  <p className="text-xs font-medium text-danger">{item.errorMessage}</p>
                ) : (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-vault-blue transition-all"
                      style={{ width: `${item.status === "done" ? 100 : item.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs text-ink-muted">
                {item.status === "validating" && "Checking…"}
                {item.status === "uploading" && `${item.progress}%`}
                {item.status === "verifying" && "Verifying…"}
                {item.status === "done" && "Uploaded"}
                {item.status === "error" && "Failed"}
              </span>
              {item.status === "error" && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon={Files}
          title="No files uploaded yet"
          description="Drag and drop files above, or use Browse Files to add deliverables to this workspace."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <FileCard key={file.id} file={file} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}
