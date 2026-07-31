"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { workspaceCreateSchema, workspaceUpdateSchema } from "@/validation/workspace";
import {
  createWorkspace,
  updateOwnedWorkspace,
  cancelOwnedWorkspace,
  closeWorkspaceForReview,
  deleteOwnedDraftWorkspace,
  InvalidStatusTransitionError,
  WorkspaceNotDeletableError,
} from "@/data-access/workspaces";
import { releaseApprovedFiles, WorkspaceNotReleasableError, NoApprovalFoundError } from "@/data-access/delivery-release";
import { OwnershipError } from "@/data-access/authorization";

export interface WorkspaceFormState {
  error?: string;
  fieldErrors?: Partial<
    Record<
      "title" | "clientName" | "description" | "deliveryMode" | "currency" | "amount" | "dueDate" | "watermarkText",
      string[]
    >
  >;
  values?: Record<string, string>;
}

export interface WorkspaceLifecycleState {
  error?: string;
  success?: string;
}

function parseWorkspaceFormData(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    clientName: String(formData.get("clientName") ?? ""),
    description: String(formData.get("description") ?? ""),
    deliveryMode: String(formData.get("deliveryMode") ?? "PAYMENT_REQUIRED"),
    currency: String(formData.get("currency") ?? "INR"),
    amount: String(formData.get("amount") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    watermarkText: String(formData.get("watermarkText") ?? ""),
  };
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Creates a DRAFT workspace from the five-step wizard's final submission. */
export async function createWorkspaceAction(
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const raw = parseWorkspaceFormData(formData);
  const parsed = workspaceCreateSchema.safeParse(raw);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: raw };
  }

  let workspaceId: string;
  try {
    ({ id: workspaceId } = await createWorkspace(parsed.data));
  } catch (error) {
    if (error instanceof OwnershipError) {
      return { error: "Select a client you own to continue.", values: raw };
    }
    console.error("Workspace creation failed:", error);
    return { error: GENERIC_ERROR, values: raw };
  }

  revalidatePath("/workspaces");
  revalidatePath("/dashboard");
  redirect(`/workspaces/${workspaceId}?flash=${encodeURIComponent("Workspace created as a draft.")}`);
}

/** Edits a workspace. Financially-locked workspaces (PAID/FILES_UNLOCKED/DELIVERED) keep their amount/currency/client unchanged regardless of what's submitted — see updateOwnedWorkspace. */
export async function updateWorkspaceAction(
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const raw = parseWorkspaceFormData(formData);
  const parsed = workspaceUpdateSchema.safeParse(raw);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: raw };
  }

  try {
    await updateOwnedWorkspace(workspaceId, parsed.data);
  } catch (error) {
    if (error instanceof OwnershipError) {
      return { error: "This workspace could not be found.", values: raw };
    }
    console.error("Workspace update failed:", error);
    return { error: GENERIC_ERROR, values: raw };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/edit`);
  revalidatePath("/workspaces");
  revalidatePath("/dashboard");
  redirect(`/workspaces/${workspaceId}?flash=${encodeURIComponent("Workspace updated.")}`);
}

/** Cancels a workspace. Never redirects — called from the workspace details page's own confirm dialog. */
export async function cancelWorkspaceAction(
  _prevState: WorkspaceLifecycleState,
  formData: FormData,
): Promise<WorkspaceLifecycleState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await cancelOwnedWorkspace(workspaceId);
  } catch (error) {
    if (error instanceof InvalidStatusTransitionError) {
      return { error: error.message };
    }
    if (error instanceof OwnershipError) {
      return { error: "This workspace could not be found." };
    }
    console.error("Workspace cancellation failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/workspaces");
  revalidatePath("/dashboard");
  return { success: "Workspace cancelled." };
}

/**
 * The creator's "Release Approved Files" action for an APPROVAL_ONLY
 * workspace — see DELIVERY_MODES.md. Never redirects; the workspace detail
 * page polls/reloads to reflect delivery-worker progress like the
 * PAYMENT_REQUIRED "Retry"/"Refresh Status" actions already do.
 */
export async function releaseFilesAction(
  _prevState: WorkspaceLifecycleState,
  formData: FormData,
): Promise<WorkspaceLifecycleState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await releaseApprovedFiles(workspaceId);
  } catch (error) {
    if (error instanceof WorkspaceNotReleasableError || error instanceof NoApprovalFoundError) {
      return { error: error.message };
    }
    if (error instanceof OwnershipError) {
      return { error: "This workspace could not be found." };
    }
    console.error("File release failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/dashboard");
  return { success: "Files are being prepared for release." };
}

/** Closes a PREVIEW_ONLY workspace once review feedback is complete — see DELIVERY_MODES.md. Never redirects. */
export async function closeWorkspaceAction(
  _prevState: WorkspaceLifecycleState,
  formData: FormData,
): Promise<WorkspaceLifecycleState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await closeWorkspaceForReview(workspaceId);
  } catch (error) {
    if (error instanceof InvalidStatusTransitionError) {
      return { error: error.message };
    }
    if (error instanceof OwnershipError) {
      return { error: "This workspace could not be found." };
    }
    console.error("Workspace closure failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/workspaces");
  revalidatePath("/dashboard");
  return { success: "Project closed." };
}

/** Permanently deletes an untouched DRAFT workspace. Redirects to /workspaces on success; returns an error and stays put otherwise. */
export async function deleteWorkspaceAction(
  _prevState: WorkspaceLifecycleState,
  formData: FormData,
): Promise<WorkspaceLifecycleState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await deleteOwnedDraftWorkspace(workspaceId);
  } catch (error) {
    if (error instanceof WorkspaceNotDeletableError) {
      return { error: error.message };
    }
    if (error instanceof OwnershipError) {
      return { error: "This workspace could not be found." };
    }
    console.error("Workspace deletion failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/workspaces");
  revalidatePath("/dashboard");
  redirect(`/workspaces?flash=${encodeURIComponent("Draft workspace deleted.")}`);
}
