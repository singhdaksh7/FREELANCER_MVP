import type { WorkspaceStatus } from "@/types";

/**
 * Derived, read-only progress indicator for the payment-gated delivery
 * workflow (create → preview → review → approve → pay). Not present as an
 * explicit field in the original mock data — computed from `status` so it
 * can never drift out of sync with the status badge shown alongside it.
 */
const PROGRESS_BY_STATUS: Record<WorkspaceStatus, number> = {
  Draft: 10,
  "Preview Processing": 25,
  "In Review": 45,
  "Changes Requested": 55,
  Approved: 75,
  "Payment Pending": 90,
  Paid: 100,
};

export function getWorkspaceProgress(status: WorkspaceStatus): number {
  return PROGRESS_BY_STATUS[status];
}
