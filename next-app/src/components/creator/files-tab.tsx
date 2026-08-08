"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
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
  deliveryMode: "PAYMENT_REQUIRED" | "APPROVAL_ONLY" | "PREVIEW_ONLY";
}

const TRANSIENT_STATUSES = new Set(["UPLOAD_PENDING", "UPLOADING", "UPLOADED", "PROCESSING"]);
const POLL_FAST_INTERVAL_MS = 1000;
const POLL_FAST_WINDOW_MS = 15_000;
const POLL_SLOW_INTERVAL_MS = 2500;

/**
 * Replaces the Phase 4 Files-tab placeholder. Orchestrates real uploads
 * (useFileUploadQueue) and polls (router.refresh()) while any file is
 * still uploading/processing, so a creator watching the tab sees
 * PROCESSING flip to READY/FAILED without manually reloading.
 *
 * Uses a single recursive `setTimeout` chain rather than `setInterval` (same
 * pattern as WorkspaceWizard's `useWizardFilePolling`) plus an explicit
 * `refreshInFlight` guard: `setInterval` fired unconditionally every
 * POLL_INTERVAL_MS regardless of whether the previous router.refresh() RSC
 * round trip had resolved, so refreshes could stack up under a slow/loaded
 * server. Only one refresh is ever in flight, the guard resets in `finally`,
 * and the chain stops entirely once `shouldPoll` goes false or the
 * component unmounts — it never continues polling a terminal status.
 *
 * Also skips firing while any FileCard reports a mutation (retry/delete)
 * pending (`pendingMutations`) — confirmed as a real bug, not a
 * hypothetical: a delete's own Server Action revalidation could be
 * clobbered by a concurrently-landing poll refresh's stale response,
 * leaving a just-deleted file's card visibly stuck on-screen.
 */
export function FilesTab({ workspaceId, files: filesProp, uploadLimits, canUpload, deliveryMode }: FilesTabProps) {
  const { queue, enqueueFiles, removeItem } = useFileUploadQueue(workspaceId, uploadLimits);
  const router = useRouter();
  const refreshInFlight = useRef(false);
  const pollStartedAtRef = useRef<number | null>(null);
  // Files with a retry/delete Server Action currently pending. While
  // non-empty, the poll below skips its own router.refresh(): that mutation
  // already revalidates and updates the tree itself, and a concurrent
  // poll-triggered refresh racing it can land after and clobber the
  // mutation's own (newer) result with stale data — see files-tab.test.tsx.
  const pendingMutations = useRef<Set<string>>(new Set());

  // PHASE 7: file deletion now goes through an explicit fetch() (see
  // FileCard's confirmDelete / ConfirmFetchDialog) whose success is
  // observed directly in the browser, rather than depending on the
  // Server Component subtree being replaced by a revalidatePath-triggered
  // RSC merge. `deletedFileIds` removes the card from the list the instant
  // that fetch resolves; `router.refresh()` (also called from
  // confirmDelete) reconciles everything else — ids that no longer appear
  // in the server-provided `files` prop are simply inert (filtering an id
  // that's already gone is a no-op), so no separate pruning effect is
  // needed; the set only ever holds ids for files deleted this session.
  const [deletedFileIds, setDeletedFileIds] = useState<Set<string>>(new Set());
  const handleFileDeleted = useCallback((fileId: string) => {
    setDeletedFileIds((prev) => new Set(prev).add(fileId));
  }, []);

  const files = filesProp.filter((f) => !deletedFileIds.has(f.id));

  const handleMutationPendingChange = useCallback((fileId: string, pending: boolean) => {
    if (pending) pendingMutations.current.add(fileId);
    else pendingMutations.current.delete(fileId);
  }, []);

  const hasTransientFiles = files.some(
    (file) => TRANSIENT_STATUSES.has(file.status) || file.pendingVersion?.status === "PROCESSING",
  );
  const hasUnsyncedUploads = queue.some(
    (item) => item.status === "done" && !files.some((f) => f.displayName === item.name)
  );
  const shouldPoll = hasTransientFiles || hasUnsyncedUploads;

  useEffect(() => {
    if (!shouldPoll) {
      pollStartedAtRef.current = null;
      return;
    }
    if (pollStartedAtRef.current === null) pollStartedAtRef.current = Date.now();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const elapsed = Date.now() - (pollStartedAtRef.current ?? Date.now());
      const delay = elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_INTERVAL_MS : POLL_SLOW_INTERVAL_MS;
      timer = setTimeout(() => {
        if (cancelled) return;
        if (refreshInFlight.current || pendingMutations.current.size > 0) {
          scheduleNext();
          return;
        }
        refreshInFlight.current = true;
        try {
          startTransition(() => {
            router.refresh();
          });
        } finally {
          refreshInFlight.current = false;
        }
        if (!cancelled) scheduleNext();
      }, delay);
    }
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      refreshInFlight.current = false;
    };
  }, [shouldPoll, router]);

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
            <FileCard
              key={file.id}
              file={file}
              workspaceId={workspaceId}
              deliveryMode={deliveryMode}
              onMutationPendingChange={handleMutationPendingChange}
              onDeleted={handleFileDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
