/**
 * Single source of truth for status → color mapping across INLAY (Stitch UI V1.0).
 * Every badge and indicator resolves colors from this map.
 */

export interface StatusStyle {
  background: string;
  color: string;
}

const DEFAULT_STATUS_STYLE: StatusStyle = {
  background: "var(--color-app-bg)",
  color: "var(--color-secondary-text)",
};

const STATUS_STYLES = {
  // Workspace & File statuses
  Draft: { background: "#F1F5F9", color: "#475569" },
  Uploading: { background: "#FEF3C7", color: "#D97706" },
  Processing: { background: "#FFF8E7", color: "#E8A020" },
  "Files Processing": { background: "#FFF8E7", color: "#E8A020" },
  Ready: { background: "#EAFBF3", color: "#12A66A" },
  "Ready for Review": { background: "#EEF4FF", color: "#356DF3" },
  "In Review": { background: "#EEF4FF", color: "#356DF3" },
  "Awaiting Client": { background: "#EEF4FF", color: "#356DF3" },
  "Changes Requested": { background: "#FFF1F2", color: "#E5484D" },
  "New Version Pending": { background: "#FFF1F2", color: "#E5484D" },
  Approved: { background: "#E0E7FF", color: "#4F46E5" },
  "Payment Pending": { background: "#FFF8E7", color: "#E8A020" },
  Paid: { background: "#EAFBF3", color: "#12A66A" },
  "Ready to Deliver": { background: "#EAFBF3", color: "#12A66A" },
  "Files Unlocked": { background: "#EAFBF3", color: "#12A66A" },
  Delivered: { background: "#EAFBF3", color: "#12A66A" },
  Completed: { background: "#EAFBF3", color: "#12A66A" },
  Active: { background: "#EAFBF3", color: "#12A66A" },
  Cancelled: { background: "#FFF1F2", color: "#E5484D" },
  Failed: { background: "#FFF1F2", color: "#E5484D" },
  
  // Payment statuses
  Pending: { background: "#FFF8E7", color: "#E8A020" },
  Created: { background: "#F1F5F9", color: "#475569" },
  "Not Required": { background: "#F1F5F9", color: "#475569" },
  "Waiting for Approval": { background: "#EEF4FF", color: "#356DF3" },
  Refunded: { background: "#F5F3FF", color: "#8B5CF6" },

  // Delivery & Review Link statuses
  Locked: { background: "#FFF8E7", color: "#E8A020" },
  Preparing: { background: "#FFF8E7", color: "#E8A020" },
  "Not Created": { background: "#F1F5F9", color: "#475569" },
  Revoked: { background: "#FFF1F2", color: "#E5484D" },
  Expired: { background: "#F1F5F9", color: "#475569" },

  // Support & misc
  "Awaiting Release": { background: "#FFF8E7", color: "#E8A020" },
  Closed: { background: "#F1F5F9", color: "#475569" },
  Open: { background: "#EEF4FF", color: "#356DF3" },
  "Under Review": { background: "#FFF8E7", color: "#E8A020" },
  "Waiting on Creator": { background: "#FFF1F2", color: "#E5484D" },
  "Waiting on Client": { background: "#FFF8E7", color: "#E8A020" },
  Resolved: { background: "#EAFBF3", color: "#12A66A" },
} as const satisfies Record<string, StatusStyle>;

export type KnownStatus = keyof typeof STATUS_STYLES;

export function getStatusStyle(status: string): StatusStyle {
  if (status in STATUS_STYLES) {
    return STATUS_STYLES[status as KnownStatus];
  }
  return DEFAULT_STATUS_STYLE;
}
