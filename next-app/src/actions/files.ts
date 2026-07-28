"use server";

import { revalidatePath } from "next/cache";
import {
  retryFileProcessing,
  deleteOwnedFile,
  FileNotRetryableError,
  FileNotDeletableError,
} from "@/data-access/files";
import { OwnershipError } from "@/data-access/authorization";

export interface FileActionState {
  error?: string;
  success?: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Re-queues processing for a failed file. Reused with ConfirmDialog (src/components/ui/confirm-dialog.tsx) via its shared {error, success} shape. */
export async function retryFileProcessingAction(
  _prevState: FileActionState,
  formData: FormData,
): Promise<FileActionState> {
  const fileId = String(formData.get("fileId") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await retryFileProcessing(fileId);
  } catch (error) {
    if (error instanceof FileNotRetryableError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This file could not be found." };
    console.error("File processing retry failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "Processing retried." };
}

/** Removes an eligible file (blocked for financially-locked workspaces — see deleteOwnedFile). */
export async function deleteFileAction(_prevState: FileActionState, formData: FormData): Promise<FileActionState> {
  const fileId = String(formData.get("fileId") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await deleteOwnedFile(fileId);
  } catch (error) {
    if (error instanceof FileNotDeletableError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This file could not be found." };
    console.error("File deletion failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "File removed." };
}
