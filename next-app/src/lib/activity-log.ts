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
  // Phase 7 — see PAYMENT_ARCHITECTURE.md / SECURE_DOWNLOAD_ARCHITECTURE.md.
  PAYMENT_ORDER_CREATED: "PAYMENT_ORDER_CREATED",
  PAYMENT_CHECKOUT_VERIFIED: "PAYMENT_CHECKOUT_VERIFIED",
  PAYMENT_CHECKOUT_VERIFICATION_FAILED: "PAYMENT_CHECKOUT_VERIFICATION_FAILED",
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  DELIVERY_PREPARATION_STARTED: "DELIVERY_PREPARATION_STARTED",
  DELIVERY_PREPARATION_FAILED: "DELIVERY_PREPARATION_FAILED",
  FILES_UNLOCKED: "FILES_UNLOCKED",
  FILE_DOWNLOADED: "FILE_DOWNLOADED",
  BUNDLE_DOWNLOADED: "BUNDLE_DOWNLOADED",
  DOWNLOAD_GRANT_REVOKED: "DOWNLOAD_GRANT_REVOKED",
  // Phase 7.5 — see REQUIREMENTS_ALIGNMENT.md.
  INLINE_CLIENT_CREATED: "INLINE_CLIENT_CREATED",
  DELIVERY_MODE_SELECTED: "DELIVERY_MODE_SELECTED",
  REVIEW_LINK_ARCHIVED: "REVIEW_LINK_ARCHIVED",
  REVIEW_LINK_READ_ONLY: "REVIEW_LINK_READ_ONLY",
  FILES_RELEASED: "FILES_RELEASED",
  WORKSPACE_CLOSED: "WORKSPACE_CLOSED",
  IMAGE_PIN_ADDED: "IMAGE_PIN_ADDED",
  IMAGE_ANNOTATION_ADDED: "IMAGE_ANNOTATION_ADDED",
  PAYMENT_BREAKDOWN_CREATED: "PAYMENT_BREAKDOWN_CREATED",
  FREELANCER_PAYABLE_CREATED: "FREELANCER_PAYABLE_CREATED",
  PAYOUT_AVAILABLE: "PAYOUT_AVAILABLE",
  PAYOUT_PROCESSING: "PAYOUT_PROCESSING",
  PAYOUT_COMPLETED: "PAYOUT_COMPLETED",
  PAYOUT_FAILED: "PAYOUT_FAILED",
  SUPPORT_TICKET_CREATED: "SUPPORT_TICKET_CREATED",
  SUPPORT_TICKET_REPLIED: "SUPPORT_TICKET_REPLIED",
  SUPPORT_TICKET_STATUS_CHANGED: "SUPPORT_TICKET_STATUS_CHANGED",
  SUPPORT_TICKET_RESOLVED: "SUPPORT_TICKET_RESOLVED",
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
  // Phase 7 — never a raw gateway secret/signature. See PAYMENT_ARCHITECTURE.md.
  amount?: number;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  failureCode?: string;
  fileCount?: number;
  downloadType?: string;
  // Phase 7.5
  deliveryMode?: string;
  clientName?: string;
  pinNumber?: number;
  annotationType?: string;
  platformFeeAmount?: number;
  freelancerPayableAmount?: number;
  payoutStatus?: string;
  ticketNumber?: string;
  ticketCategory?: string;
  ticketStatus?: string;
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
    case ActivityAction.PAYMENT_ORDER_CREATED:
      return meta.amount !== undefined && meta.currency
        ? `Payment order created for ${formatCurrencyAmount(meta.amount, meta.currency)}`
        : "Payment order created";
    case ActivityAction.PAYMENT_CHECKOUT_VERIFIED:
      return "Checkout signature verified — confirming settlement";
    case ActivityAction.PAYMENT_CHECKOUT_VERIFICATION_FAILED:
      return "Checkout signature verification failed";
    case ActivityAction.PAYMENT_CAPTURED:
      return meta.amount !== undefined && meta.currency
        ? `Payment captured — ${formatCurrencyAmount(meta.amount, meta.currency)}`
        : "Payment captured";
    case ActivityAction.PAYMENT_FAILED:
      return meta.failureCode ? `Payment failed (${meta.failureCode})` : "Payment failed";
    case ActivityAction.DELIVERY_PREPARATION_STARTED:
      return "Preparing original files for secure delivery";
    case ActivityAction.DELIVERY_PREPARATION_FAILED:
      return "Delivery preparation failed — retry available";
    case ActivityAction.FILES_UNLOCKED:
      return meta.fileCount
        ? `Original files unlocked (${meta.fileCount} file${meta.fileCount === 1 ? "" : "s"})`
        : "Original files unlocked";
    case ActivityAction.FILE_DOWNLOADED:
      return meta.fileName ? `Original downloaded: ${meta.fileName}` : "Original file downloaded";
    case ActivityAction.BUNDLE_DOWNLOADED:
      return "Full delivery bundle downloaded";
    case ActivityAction.DOWNLOAD_GRANT_REVOKED:
      return "Download access revoked";
    case ActivityAction.INLINE_CLIENT_CREATED:
      return meta.clientName ? `New client ${meta.clientName} added during workspace creation` : "New client added during workspace creation";
    case ActivityAction.DELIVERY_MODE_SELECTED:
      return meta.deliveryMode ? `Delivery type set to ${meta.deliveryMode.replace(/_/g, " ").toLowerCase()}` : "Delivery type selected";
    case ActivityAction.REVIEW_LINK_ARCHIVED:
      return "Master review link archived";
    case ActivityAction.REVIEW_LINK_READ_ONLY:
      return "Master review link is now read-only";
    case ActivityAction.FILES_RELEASED:
      return "Approved files released to the client";
    case ActivityAction.WORKSPACE_CLOSED:
      return "Project closed";
    case ActivityAction.IMAGE_PIN_ADDED:
      return meta.pinNumber ? `Pin #${meta.pinNumber} added` : "Image pin added";
    case ActivityAction.IMAGE_ANNOTATION_ADDED:
      return meta.annotationType ? `${meta.annotationType.toLowerCase()} annotation added` : "Annotation added";
    case ActivityAction.PAYMENT_BREAKDOWN_CREATED:
      return "Fee breakdown calculated";
    case ActivityAction.FREELANCER_PAYABLE_CREATED:
      return meta.freelancerPayableAmount !== undefined && meta.currency
        ? `Payable balance credited — ${formatCurrencyAmount(meta.freelancerPayableAmount, meta.currency)}`
        : "Payable balance credited";
    case ActivityAction.PAYOUT_AVAILABLE:
      return "Payout balance marked available (test mode)";
    case ActivityAction.PAYOUT_PROCESSING:
      return "Test payout started";
    case ActivityAction.PAYOUT_COMPLETED:
      return "Test payout completed";
    case ActivityAction.PAYOUT_FAILED:
      return "Test payout failed";
    case ActivityAction.SUPPORT_TICKET_CREATED:
      return meta.ticketNumber ? `Support ticket ${meta.ticketNumber} opened` : "Support ticket opened";
    case ActivityAction.SUPPORT_TICKET_REPLIED:
      return "Support ticket reply added";
    case ActivityAction.SUPPORT_TICKET_STATUS_CHANGED:
      return meta.ticketStatus ? `Support ticket status changed to ${meta.ticketStatus.replace(/_/g, " ").toLowerCase()}` : "Support ticket status changed";
    case ActivityAction.SUPPORT_TICKET_RESOLVED:
      return "Support ticket resolved";
    default:
      // Legacy/pre-Phase-4 rows already store a finished, human-readable
      // sentence directly in `action` — render it unchanged.
      return action;
  }
}
