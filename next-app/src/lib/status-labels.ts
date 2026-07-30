/**
 * Humanizes the database's SCREAMING_SNAKE_CASE enum values (WorkspaceStatus,
 * PaymentStatus) into the exact display strings the centralized
 * status-config (src/lib/status-config.ts) already has styles for — so
 * StatusBadge needs no changes to render DB-backed records.
 */

const WORKSPACE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PREVIEW_PROCESSING: "Preview Processing",
  IN_REVIEW: "In Review",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVED: "Approved",
  PAYMENT_PENDING: "Payment Pending",
  PAID: "Paid",
  FILES_UNLOCKED: "Files Unlocked",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  AWAITING_CREATOR_RELEASE: "Awaiting Release",
  CLOSED: "Closed",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: "Created",
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export function workspaceStatusLabel(status: string): string {
  return WORKSPACE_STATUS_LABELS[status] ?? status;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

const DELIVERY_MODE_LABELS: Record<string, string> = {
  PAYMENT_REQUIRED: "Payment Required",
  APPROVAL_ONLY: "Approval Only",
  PREVIEW_ONLY: "Preview Only",
};

export function deliveryModeLabel(mode: string): string {
  return DELIVERY_MODE_LABELS[mode] ?? mode;
}

const SUPPORT_TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under Review",
  WAITING_FOR_CREATOR: "Waiting on Creator",
  WAITING_FOR_CLIENT: "Waiting on Client",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function supportTicketStatusLabel(status: string): string {
  return SUPPORT_TICKET_STATUS_LABELS[status] ?? status;
}

const SUPPORT_TICKET_CATEGORY_LABELS: Record<string, string> = {
  PAYMENT: "Payment",
  DELIVERY: "Delivery",
  QUALITY_DISPUTE: "Quality Dispute",
  FILE_PROCESSING: "File Processing",
  ACCOUNT: "Account",
  OTHER: "Other",
};

export function supportTicketCategoryLabel(category: string): string {
  return SUPPORT_TICKET_CATEGORY_LABELS[category] ?? category;
}
