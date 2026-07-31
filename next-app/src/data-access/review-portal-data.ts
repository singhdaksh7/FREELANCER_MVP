import "server-only";
import { getReviewableFiles, type ReviewableFile } from "./review-files";
import { getReviewCommentThreads, type ReviewCommentThreadItem } from "./review-comments";
import { getActiveChangeRequest, type ActiveChangeRequest } from "./change-requests";
import { getApprovalSummary, type ApprovalSummary } from "./approvals";

export interface ReviewPortalWorkspaceData {
  files: ReviewableFile[];
  comments: ReviewCommentThreadItem[];
  activeChangeRequest: ActiveChangeRequest | null;
  approval: ApprovalSummary | null;
}

/**
 * Shared files/comments/change-request/approval loading for the
 * ReviewPortal component — used by both the public token-authorized
 * review page (/review/[token]) and the creator-authenticated read-only
 * "Preview Client View" (/workspaces/[id]/preview), so the two surfaces
 * can never drift in what data the portal renders. Callers are
 * responsible for their own authorization before calling this — it takes
 * only a workspaceId and performs no ownership/token checks itself.
 */
export async function getReviewPortalWorkspaceData(workspaceId: string): Promise<ReviewPortalWorkspaceData> {
  const [files, comments, activeChangeRequest, approval] = await Promise.all([
    getReviewableFiles({ workspaceId }),
    getReviewCommentThreads(workspaceId),
    getActiveChangeRequest(workspaceId),
    getApprovalSummary(workspaceId),
  ]);

  return { files, comments, activeChangeRequest, approval };
}
