import { formatDate } from "./format-date";

/**
 * Centralized activity-log action codes + human-readable formatter.
 * Every Phase 4 mutation writes one of these codes (never a hand-built
 * sentence) into `ActivityLog.action`, with structured `metadata` — so the
 * UI never has to construct or duplicate activity copy itself (see
 * MUTATION_ARCHITECTURE.md "Activity logging").
 *
 * Rows created before Phase 4 (the seed data) store a plain, already
 * human-readable sentence directly in `action` with no matching code here —
 * formatActivityLabel() falls back to rendering that string unchanged, so
 * old and new rows render correctly side by side.
 */
export const ActivityAction = {
  WORKSPACE_CREATED: "WORKSPACE_CREATED",
  WORKSPACE_UPDATED: "WORKSPACE_UPDATED",
  WORKSPACE_CANCELLED: "WORKSPACE_CANCELLED",
  WORKSPACE_DELETED: "WORKSPACE_DELETED",
  CLIENT_CHANGED: "CLIENT_CHANGED",
  AMOUNT_CHANGED: "AMOUNT_CHANGED",
  DUE_DATE_CHANGED: "DUE_DATE_CHANGED",
  CLIENT_CREATED: "CLIENT_CREATED",
  CLIENT_UPDATED: "CLIENT_UPDATED",
  CLIENT_DELETED: "CLIENT_DELETED",
  FILE_UPLOAD_STARTED: "FILE_UPLOAD_STARTED",
  FILE_UPLOADED: "FILE_UPLOADED",
  FILE_PROCESSING_COMPLETED: "FILE_PROCESSING_COMPLETED",
  FILE_PROCESSING_FAILED: "FILE_PROCESSING_FAILED",
  FILE_PROCESSING_RETRIED: "FILE_PROCESSING_RETRIED",
  FILE_DELETED: "FILE_DELETED",
  // Phase 6 — see CLIENT_REVIEW_ARCHITECTURE.md.
  REVIEW_LINK_CREATED: "REVIEW_LINK_CREATED",
  REVIEW_LINK_REVOKED: "REVIEW_LINK_REVOKED",
  REVIEW_LINK_REGENERATED: "REVIEW_LINK_REGENERATED",
  /** Defined for completeness but deliberately never written per-view — see
   * "Avoid logging every preview request" in CLIENT_REVIEW_ARCHITECTURE.md.
   * View counting uses ReviewLink.viewCount/lastViewedAt instead. */
  REVIEW_LINK_VIEWED: "REVIEW_LINK_VIEWED",
  COMMENT_ADDED: "COMMENT_ADDED",
  COMMENT_REPLIED: "COMMENT_REPLIED",
  COMMENT_RESOLVED: "COMMENT_RESOLVED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  FILE_VERSION_UPLOAD_STARTED: "FILE_VERSION_UPLOAD_STARTED",
  FILE_VERSION_UPLOADED: "FILE_VERSION_UPLOADED",
  FILE_VERSION_PROCESSING_COMPLETED: "FILE_VERSION_PROCESSING_COMPLETED",
  FILE_VERSION_PROCESSING_FAILED: "FILE_VERSION_PROCESSING_FAILED",
  REVISION_SUBMITTED: "REVISION_SUBMITTED",
  PROJECT_APPROVED: "PROJECT_APPROVED",
} as const;

export type ActivityActionCode = (typeof ActivityAction)[keyof typeof ActivityAction];

export interface ActivityMetadata {
  changedFields?: string[];
  fromClientName?: string;
  toClientName?: string;
  fromAmount?: number;
  toAmount?: number;
  currency?: string;
  fromDueDate?: string | null;
  toDueDate?: string | null;
  name?: string;
  title?: string;
  fileName?: string;
  errorSummary?: string;
  attempt?: number;
  // Phase 6 — never a raw token; tokenPrefix only (see REVIEW_TOKEN_SECURITY.md).
  tokenPrefix?: string;
  reviewerName?: string;
  commentPreview?: string;
  versionNumber?: number;
  versionCount?: number;
  changeRequestSummary?: string;
}

function formatCurrencyAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDueDate(value: string | null | undefined): string {
  if (!value) return "no due date";
  return formatDate(value);
}

/**
 * Renders a safe, human-readable sentence for one activity-log row. Never
 * includes anything beyond what's already in `metadata` — no secrets, no
 * raw form payloads (see MUTATION_ARCHITECTURE.md "What activity metadata
 * never contains").
 */
export function formatActivityLabel(action: string, metadata: unknown): string {
  const meta = (metadata ?? {}) as ActivityMetadata;

  switch (action) {
    case ActivityAction.WORKSPACE_CREATED:
      return "Workspace created";
    case ActivityAction.WORKSPACE_UPDATED:
      return meta.changedFields?.length
        ? `Workspace updated (${meta.changedFields.join(", ")})`
        : "Workspace updated";
    case ActivityAction.WORKSPACE_CANCELLED:
      return "Workspace cancelled";
    case ActivityAction.WORKSPACE_DELETED:
      return "Draft workspace deleted";
    case ActivityAction.CLIENT_CHANGED:
      return meta.toClientName ? `Client changed to ${meta.toClientName}` : "Client changed";
    case ActivityAction.AMOUNT_CHANGED:
      return meta.toAmount !== undefined && meta.currency
        ? `Amount changed to ${formatCurrencyAmount(meta.toAmount, meta.currency)}`
        : "Amount changed";
    case ActivityAction.DUE_DATE_CHANGED:
      return `Due date changed to ${formatDueDate(meta.toDueDate)}`;
    case ActivityAction.CLIENT_CREATED:
      return meta.name ? `Client ${meta.name} added` : "Client added";
    case ActivityAction.CLIENT_UPDATED:
      return meta.changedFields?.length
        ? `Client updated (${meta.changedFields.join(", ")})`
        : "Client updated";
    case ActivityAction.CLIENT_DELETED:
      return meta.name ? `Client ${meta.name} deleted` : "Client deleted";
    case ActivityAction.FILE_UPLOAD_STARTED:
      return meta.fileName ? `Upload started: ${meta.fileName}` : "File upload started";
    case ActivityAction.FILE_UPLOADED:
      return meta.fileName ? `File uploaded: ${meta.fileName}` : "File uploaded";
    case ActivityAction.FILE_PROCESSING_COMPLETED:
      return meta.fileName ? `Preview ready: ${meta.fileName}` : "File processing completed";
    case ActivityAction.FILE_PROCESSING_FAILED:
      return meta.fileName ? `Processing failed: ${meta.fileName}` : "File processing failed";
    case ActivityAction.FILE_PROCESSING_RETRIED:
      return meta.fileName ? `Processing retried: ${meta.fileName}` : "File processing retried";
    case ActivityAction.FILE_DELETED:
      return meta.fileName ? `File deleted: ${meta.fileName}` : "File deleted";
    case ActivityAction.REVIEW_LINK_CREATED:
      return meta.tokenPrefix ? `Secure review link created (${meta.tokenPrefix}…)` : "Secure review link created";
    case ActivityAction.REVIEW_LINK_REVOKED:
      return "Secure review link revoked";
    case ActivityAction.REVIEW_LINK_REGENERATED:
      return meta.tokenPrefix
        ? `Secure review link regenerated (${meta.tokenPrefix}…)`
        : "Secure review link regenerated";
    case ActivityAction.REVIEW_LINK_VIEWED:
      return "Review link viewed";
    case ActivityAction.COMMENT_ADDED:
      return meta.reviewerName ? `${meta.reviewerName} added a comment` : "Comment added";
    case ActivityAction.COMMENT_REPLIED:
      return meta.reviewerName ? `${meta.reviewerName} replied to a comment` : "Reply added";
    case ActivityAction.COMMENT_RESOLVED:
      return "Comment resolved";
    case ActivityAction.CHANGES_REQUESTED:
      return meta.reviewerName ? `${meta.reviewerName} requested changes` : "Changes requested";
    case ActivityAction.FILE_VERSION_UPLOAD_STARTED:
      return meta.fileName ? `New version upload started: ${meta.fileName}` : "New version upload started";
    case ActivityAction.FILE_VERSION_UPLOADED:
      return meta.fileName && meta.versionNumber
        ? `${meta.fileName} — version ${meta.versionNumber} uploaded`
        : "New file version uploaded";
    case ActivityAction.FILE_VERSION_PROCESSING_COMPLETED:
      return meta.fileName && meta.versionNumber
        ? `${meta.fileName} — version ${meta.versionNumber} ready`
        : "New file version ready";
    case ActivityAction.FILE_VERSION_PROCESSING_FAILED:
      return meta.fileName && meta.versionNumber
        ? `${meta.fileName} — version ${meta.versionNumber} processing failed`
        : "New file version processing failed";
    case ActivityAction.REVISION_SUBMITTED:
      return meta.versionCount
        ? `Revision submitted for review (${meta.versionCount} file${meta.versionCount === 1 ? "" : "s"})`
        : "Revision submitted for review";
    case ActivityAction.PROJECT_APPROVED:
      return meta.reviewerName ? `Project approved by ${meta.reviewerName}` : "Project approved";
    default:
      // Legacy/pre-Phase-4 rows already store a finished, human-readable
      // sentence directly in `action` — render it unchanged.
      return action;
  }
}
