"use server";

import { revalidatePath } from "next/cache";
import { addCreatorReviewComment, resolveReviewComment, CommentValidationError, CommentNotFoundError } from "@/data-access/review-comments";
import { OwnershipError } from "@/data-access/authorization";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface ReviewCommentActionState {
  error?: string;
  success?: string;
}

export async function addCreatorCommentAction(
  _prevState: ReviewCommentActionState,
  formData: FormData,
): Promise<ReviewCommentActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const body = String(formData.get("body") ?? "");
  const workspaceFileId = String(formData.get("workspaceFileId") ?? "") || undefined;
  const parentId = String(formData.get("parentId") ?? "") || undefined;

  try {
    await addCreatorReviewComment(workspaceId, { body, workspaceFileId, parentId });
  } catch (error) {
    if (error instanceof CommentValidationError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Creator comment failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: parentId ? "Reply added." : "Comment added." };
}

export async function resolveCommentAction(
  _prevState: ReviewCommentActionState,
  formData: FormData,
): Promise<ReviewCommentActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const commentId = String(formData.get("commentId") ?? "");

  try {
    await resolveReviewComment(commentId);
  } catch (error) {
    if (error instanceof CommentNotFoundError) return { error: error.message };
    console.error("Comment resolution failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "Comment resolved." };
}
