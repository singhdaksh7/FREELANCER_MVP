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
