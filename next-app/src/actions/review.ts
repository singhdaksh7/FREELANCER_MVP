"use server";

import { revalidatePath } from "next/cache";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { addClientReviewComment, CommentValidationError } from "@/data-access/review-comments";
import { createChangeRequest, ChangeRequestValidationError, ChangeRequestAlreadyOpenError } from "@/data-access/change-requests";
import { approveWorkspace, ApprovalValidationError, ApprovalBlockedError, ApprovalAlreadyCompletedError } from "@/data-access/approvals";

/**
 * Client-facing Server Actions — no session, no cookie identity. Every
 * action re-authorizes the raw token (passed as a hidden form field, never
 * a URL param on the action itself) exactly like the /review/[token] page
 * does; a failed/expired/revoked token returns the same generic message
 * the page's own system-state screen would show, and this module never
 * logs or echoes the raw token anywhere (see REVIEW_TOKEN_SECURITY.md).
 */

const TOKEN_INVALID_MESSAGE = "This review link is no longer valid. Please refresh the page.";

function friendlyTokenError(error: unknown): string | null {
  if (
    error instanceof InvalidReviewTokenError ||
    error instanceof ReviewLinkExpiredError ||
    error instanceof ReviewLinkRevokedError ||
    error instanceof WorkspaceUnavailableError
  ) {
    return TOKEN_INVALID_MESSAGE;
  }
  return null;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface ReviewClientActionState {
  error?: string;
  success?: string;
}

export async function addReviewCommentAction(
  _prevState: ReviewClientActionState,
  formData: FormData,
): Promise<ReviewClientActionState> {
  const token = String(formData.get("token") ?? "");
  const body = String(formData.get("body") ?? "");
  const workspaceFileId = String(formData.get("workspaceFileId") ?? "") || undefined;
  const fileVersionId = String(formData.get("fileVersionId") ?? "") || undefined;
  const parentId = String(formData.get("parentId") ?? "") || undefined;
  const pinXRaw = formData.get("pinX");
  const pinYRaw = formData.get("pinY");
  const reviewerName = String(formData.get("reviewerName") ?? "") || undefined;
  const reviewerEmail = String(formData.get("reviewerEmail") ?? "") || undefined;

  try {
    const context = await authorizeReviewToken(token);
    await addClientReviewComment(context, {
      body,
      workspaceFileId,
      fileVersionId,
      parentId,
      pinX: pinXRaw ? Number(pinXRaw) : undefined,
      pinY: pinYRaw ? Number(pinYRaw) : undefined,
      reviewerName,
      reviewerEmail,
    });
    revalidatePath(`/review/${token}`);
    return { success: parentId ? "Reply added." : "Comment added." };
  } catch (error) {
    const tokenMessage = friendlyTokenError(error);
    if (tokenMessage) return { error: tokenMessage };
    if (error instanceof CommentValidationError) return { error: error.message };
    console.error("Client comment failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export async function requestChangesAction(
  _prevState: ReviewClientActionState,
  formData: FormData,
): Promise<ReviewClientActionState> {
  const token = String(formData.get("token") ?? "");
  const summary = String(formData.get("summary") ?? "");
  const reviewerName = String(formData.get("reviewerName") ?? "") || undefined;
  const reviewerEmail = String(formData.get("reviewerEmail") ?? "") || undefined;

  try {
    const context = await authorizeReviewToken(token);
    await createChangeRequest(context, { summary, reviewerName, reviewerEmail });
    revalidatePath(`/review/${token}`);
    return { success: "Change request submitted." };
  } catch (error) {
    const tokenMessage = friendlyTokenError(error);
    if (tokenMessage) return { error: tokenMessage };
    if (error instanceof ChangeRequestAlreadyOpenError) return { error: error.message };
    if (error instanceof ChangeRequestValidationError) return { error: error.message };
    console.error("Change request failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export interface ApproveActionState extends ReviewClientActionState {
  approved?: boolean;
}

export async function approveWorkspaceAction(
  _prevState: ApproveActionState,
  formData: FormData,
): Promise<ApproveActionState> {
  const token = String(formData.get("token") ?? "");
  const reviewerName = String(formData.get("reviewerName") ?? "");
  const reviewerEmail = String(formData.get("reviewerEmail") ?? "") || undefined;
  const termsAccepted = formData.get("termsAccepted") === "on" || formData.get("termsAccepted") === "true";
  const userAgent = String(formData.get("userAgent") ?? "") || undefined;

  try {
    const context = await authorizeReviewToken(token);
    await approveWorkspace(context, { reviewerName, reviewerEmail, termsAccepted, userAgent });
    revalidatePath(`/review/${token}`);
    return { success: "Project approved.", approved: true };
  } catch (error) {
    const tokenMessage = friendlyTokenError(error);
    if (tokenMessage) return { error: tokenMessage };
    if (error instanceof ApprovalAlreadyCompletedError) return { error: error.message, approved: true };
    if (error instanceof ApprovalBlockedError) return { error: error.message };
    if (error instanceof ApprovalValidationError) return { error: error.message };
    console.error("Approval failed:", error);
    return { error: GENERIC_ERROR };
  }
}
