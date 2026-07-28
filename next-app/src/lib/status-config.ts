/**
 * Single source of truth for status → color mapping across the app.
 * Ported 1:1 from the original Vite StatusBadge switch statement
 * (src/components/common/UIComponents.jsx) so every screen that renders
 * a workspace/client/payment status resolves to the same colors.
 */

export interface StatusStyle {
  background: string;
  color: string;
}

const DEFAULT_STATUS_STYLE: StatusStyle = {
  background: "var(--color-surface)",
  color: "var(--color-ink-muted)",
};

const STATUS_STYLES = {
  Draft: { background: "#F1F5F9", color: "#475569" },
  "Preview Processing": { background: "#FEF3C7", color: "#D97706" },
  "In Review": { background: "#DBEAFE", color: "#2563EB" },
  "Changes Requested": { background: "#FEE2E2", color: "#DC2626" },
  Approved: { background: "#E0E7FF", color: "#4F46E5" },
  "Payment Pending": { background: "#FEF3C7", color: "#B45309" },
  Paid: { background: "#D1FAE5", color: "#059669" },
  "Files Unlocked": { background: "#D1FAE5", color: "#059669" },
  Delivered: { background: "#D1FAE5", color: "#059669" },
  Completed: { background: "#D1FAE5", color: "#059669" },
  Active: { background: "#D1FAE5", color: "#059669" },
  // Added in Phase 3 for the database-backed WorkspaceStatus/PaymentStatus
  // enums, which cover a couple of states the Phase 1/2 mock data never
  // needed. Colors follow the same semantic families as the entries above
  // (green = settled/positive, amber = pending, red = negative/attention).
  Cancelled: { background: "#FEE2E2", color: "#DC2626" },
  Pending: { background: "#FEF3C7", color: "#B45309" },
  Created: { background: "#F1F5F9", color: "#475569" },
  Failed: { background: "#FEF2F2", color: "#EF4444" },
  Refunded: { background: "#F5F3FF", color: "#8B5CF6" },
} as const satisfies Record<string, StatusStyle>;

export type KnownStatus = keyof typeof STATUS_STYLES;

export function getStatusStyle(status: string): StatusStyle {
  if (status in STATUS_STYLES) {
    return STATUS_STYLES[status as KnownStatus];
  }
  return DEFAULT_STATUS_STYLE;
}
