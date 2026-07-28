import type { WorkspaceStatus } from "@/generated/prisma/enums";

/** Thrown by assertWorkspaceTransition (and any status-changing data-access function) for a status change that isn't in the allow-list below. */
export class InvalidStatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusTransitionError";
  }
}

/**
 * Centralized workspace status-transition policy — the single source of
 * truth every status-changing function in this app must route through
 * (creator cancel, review-link creation, change requests, revision
 * submission, approval). Phase 6 implements only the transitions the
 * brief explicitly calls for; Phase 7 will extend this table with
 * APPROVED -> PAYMENT_PENDING -> PAID -> FILES_UNLOCKED -> DELIVERED, not
 * implemented here. See CLIENT_REVIEW_ARCHITECTURE.md "State transitions."
 */
const ALLOWED_TRANSITIONS: Record<WorkspaceStatus, readonly WorkspaceStatus[]> = {
  DRAFT: ["IN_REVIEW", "CANCELLED"],
  PREVIEW_PROCESSING: ["CANCELLED"],
  IN_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "CANCELLED"],
  CHANGES_REQUESTED: ["IN_REVIEW", "CANCELLED"],
  // Cancellation remains reachable from any non-financially-locked status
  // (matches Phase 4's pre-existing FINANCIAL_LOCK_STATUSES rule) — APPROVED
  // and PAYMENT_PENDING are not locked, only PAID/FILES_UNLOCKED/DELIVERED
  // are, so a creator can still cancel an approved-but-unpaid project.
  APPROVED: ["CANCELLED"],
  PAYMENT_PENDING: ["CANCELLED"],
  PAID: [],
  FILES_UNLOCKED: [],
  DELIVERED: [],
  CANCELLED: [],
};

/** Throws InvalidStatusTransitionError if `to` is not a permitted transition from `from`. A no-op transition (from === to) is never permitted — callers should check that separately if idempotency is desired. */
export function assertWorkspaceTransition(from: WorkspaceStatus, to: WorkspaceStatus): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidStatusTransitionError(`Cannot move a workspace from ${from} to ${to}.`);
  }
}

/** Read-only check (no throw) — useful for UI gating without a try/catch. */
export function canTransitionWorkspace(from: WorkspaceStatus, to: WorkspaceStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
