"use server";

import { revalidatePath } from "next/cache";
import {
  createReviewLink,
  revokeReviewLink,
  regenerateReviewLink,
  ReviewLinkNotEligibleError,
  ReviewLinkNotFoundError,
} from "@/data-access/review-links";
import { OwnershipError } from "@/data-access/authorization";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export interface ReviewLinkActionState {
  error?: string;
  success?: string;
  /** The complete review link URL — present only immediately after a successful create/regenerate, never persisted, never shown again after this render. */
  rawLink?: string;
  /** null for a project-duration link. */
  expiresAt?: string | null;
}

export async function createReviewLinkAction(
  _prevState: ReviewLinkActionState,
  formData: FormData,
): Promise<ReviewLinkActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    const { rawToken, expiresAt } = await createReviewLink(workspaceId);
    revalidatePath(`/workspaces/${workspaceId}`);
    return {
      success: "Secure review link created.",
      rawLink: `/review/${rawToken}`,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof ReviewLinkNotEligibleError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Review link creation failed:", error);
    return { error: GENERIC_ERROR };
  }
}

export async function revokeReviewLinkAction(
  _prevState: ReviewLinkActionState,
  formData: FormData,
): Promise<ReviewLinkActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    await revokeReviewLink(workspaceId);
  } catch (error) {
    if (error instanceof ReviewLinkNotFoundError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Review link revocation failed:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: "Review link revoked. The old link no longer works." };
}

export async function regenerateReviewLinkAction(
  _prevState: ReviewLinkActionState,
  formData: FormData,
): Promise<ReviewLinkActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");

  try {
    const { rawToken, expiresAt } = await regenerateReviewLink(workspaceId);
    revalidatePath(`/workspaces/${workspaceId}`);
    return {
      success: "New secure review link generated. The old link no longer works.",
      rawLink: `/review/${rawToken}`,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof ReviewLinkNotEligibleError) return { error: error.message };
    if (error instanceof OwnershipError) return { error: "This workspace could not be found." };
    console.error("Review link regeneration failed:", error);
    return { error: GENERIC_ERROR };
  }
}
