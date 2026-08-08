"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupportedMimeType, unsupportedFileMessage } from "@/lib/file-kind";
import { prewarmFileWorkerAction } from "@/actions/worker-wake";

export interface UploadLimits {
  maxFileSizeBytes: number;
  maxFilesPerWorkspace: number;
  maxTotalWorkspaceBytes: number;
}

export type QueueItemStatus = "validating" | "uploading" | "verifying" | "done" | "error";

export interface QueueItem {
  id: string;
  name: string;
  sizeBytes: number;
  progress: number;
  status: QueueItemStatus;
  errorMessage?: string;
  sessionId?: string;
  timingCorrelationId?: string;
  revision?: string;
  fileId?: string;
}

let idCounter = 0;
function nextQueueId(): string {
  idCounter += 1;
  return `upload-${Date.now()}-${idCounter}`;
}

/**
 * Client-side upload orchestration for the secure upload workflow (see
 * FILE_STORAGE_ARCHITECTURE.md): request a presigned session, PUT
 * directly to object storage with real progress events, then ask the
 * server to verify and complete it. Nothing here is trusted as final —
 * every step the server can re-check, it does (src/data-access/uploads.ts).
 */
export function useFileUploadQueue(workspaceId: string, limits: UploadLimits) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const router = useRouter();
  const hasPrewarmedRef = useRef(false);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      const id = nextQueueId();
      setQueue((prev) => [...prev, { id, name: file.name, sizeBytes: file.size, progress: 0, status: "validating" }]);

      if (!isSupportedMimeType(file.type)) {
        updateItem(id, { status: "error", errorMessage: unsupportedFileMessage(file) });
        return;
      }
      if (file.size > limits.maxFileSizeBytes) {
        updateItem(id, {
          status: "error",
          errorMessage: `File is larger than the ${Math.floor(limits.maxFileSizeBytes / (1024 * 1024))} MB limit.`,
        });
        return;
      }

      if (!hasPrewarmedRef.current) {
        hasPrewarmedRef.current = true;
        void prewarmFileWorkerAction().catch(() => {});
      }

      try {
        const sessionResponse = await fetch(`/api/workspaces/${workspaceId}/upload-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        const sessionData = await sessionResponse.json();
        if (!sessionResponse.ok) {
          console.error("Upload session failed:", sessionResponse.status, sessionData);
          updateItem(id, { status: "error", errorMessage: sessionData.error ?? "Could not start this upload." });
          return;
        }
        updateItem(id, { timingCorrelationId: sessionData.timingCorrelationId, revision: sessionResponse.headers.get("X-INLAY-Revision") ?? "unknown" });
        console.info("[upload-client] session_created", sessionData.timingCorrelationId);

        updateItem(id, { status: "uploading" });
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", sessionData.uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              updateItem(id, { progress: Math.round((event.loaded / event.total) * 100) });
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("Upload failed. Please check your connection and try again."));
          };
          xhr.onerror = () => reject(new Error("Upload failed. Please check your connection and try again."));
          xhr.send(file);
        });
        void fetch(`/api/upload-sessions/${sessionData.sessionId}/timing`, { method: "POST", headers: { "Content-Type": "application/json", "X-INLAY-Upload-Correlation": sessionData.timingCorrelationId }, body: JSON.stringify({ stage: "browser_upload_finished" }) }).catch(() => {});

        updateItem(id, { status: "verifying", progress: 100 });
        const completeResponse = await fetch(`/api/upload-sessions/${sessionData.sessionId}/complete`, {
          method: "POST",
        });
        const completeData = await completeResponse.json();
        if (!completeResponse.ok) {
          console.error("Upload complete failed:", completeResponse.status, completeData);
          updateItem(id, { status: "error", errorMessage: completeData.error ?? "This file could not be verified." });
          return;
        }

        // Completion only means the original is durable and the protected
        // preview job was committed.  The file card will immediately show
        // the honest processing state while its adaptive poll observes READY.
        updateItem(id, { status: "done", sessionId: sessionData.sessionId, timingCorrelationId: completeData.timingCorrelationId, fileId: completeData.fileId });
        // Use a transition to prevent Next.js from aborting the RSC fetch if
        // other state updates happen concurrently.
        import("react").then(({ startTransition }) => {
          startTransition(() => {
            router.refresh();
          });
        });
      } catch (error) {
        updateItem(id, { status: "error", errorMessage: error instanceof Error ? error.message : "Upload failed." });
      }
    },
    [workspaceId, limits, updateItem, router],
  );

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        void uploadOne(file);
      });
    },
    [uploadOne],
  );

  return { queue, enqueueFiles, removeItem };
}
