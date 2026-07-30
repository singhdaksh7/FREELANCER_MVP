"use server";

import { revalidatePath } from "next/cache";
import { submitRevision, RevisionNotReadyError } from "@/data-access/revisions";
import { OwnershipError } from "@/data-access/authorization";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface RevisionActionState {
  error?: string;
  success?: string;
}

export async function submitRevisionAction(
  _prevState: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await submitRevision(workspaceId);
  } catch (error) {
    if (error instanceof RevisionNotReadyError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Revision submission failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "Revision submitted for review." };
}
