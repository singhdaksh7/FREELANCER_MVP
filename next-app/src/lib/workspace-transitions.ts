import type { WorkspaceStatus, DeliveryMode } from "@/generated/prisma/enums";

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
 * submission, approval, payment order creation, payment finalization,
 * delivery preparation, first secure download, creator release, preview
 * closure). See CLIENT_REVIEW_ARCHITECTURE.md "State transitions",
 * PAYMENT_ARCHITECTURE.md "Payment state machine", and DELIVERY_MODES.md
 * for the full three-mode picture.
 *
 * Phase 7.5 — the allow-list is now keyed by `DeliveryMode` as well as
 * `from`: the same `IN_REVIEW` status permits `APPROVED` under
 * PAYMENT_REQUIRED/APPROVAL_ONLY but never under PREVIEW_ONLY (a preview
 * client can never approve for delivery), and the post-approval path
 * diverges entirely per mode — see DELIVERY_MODES.md for the three full
 * workflow diagrams.
 */
const SHARED_PRE_REVIEW = {
  DRAFT: ["IN_REVIEW", "CANCELLED"],
  PREVIEW_PROCESSING: ["CANCELLED"],
} as const;

type TransitionTable = Record<WorkspaceStatus, readonly WorkspaceStatus[]>;

const PAYMENT_REQUIRED_TRANSITIONS: TransitionTable = {
  ...SHARED_PRE_REVIEW,
  IN_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "CANCELLED"],
  CHANGES_REQUESTED: ["IN_REVIEW", "CANCELLED"],
  // Cancellation remains reachable from any non-financially-locked status
  // (matches Phase 4's pre-existing FINANCIAL_LOCK_STATUSES rule) — APPROVED
  // and PAYMENT_PENDING are not locked, only PAID/FILES_UNLOCKED/DELIVERED
  // are, so a creator can still cancel an approved-but-unpaid project.
  APPROVED: ["CANCELLED", "PAYMENT_PENDING"],
  PAYMENT_PENDING: ["CANCELLED", "AWAITING_CREATOR_RELEASE"],
  // Financially locked from here on — no CANCELLED transition. A failed
  // payment never leaves PAYMENT_PENDING (the Payment row is simply marked
  // FAILED; the workspace stays PAYMENT_PENDING so the client can retry
  // with a new order — see PAYMENT_ARCHITECTURE.md "Failure behavior").
  PAID: [],
  FILES_UNLOCKED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  AWAITING_CREATOR_RELEASE: ["FILES_UNLOCKED"],
  CLOSED: [],
};

const APPROVAL_ONLY_TRANSITIONS: TransitionTable = {
  ...SHARED_PRE_REVIEW,
  IN_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "CANCELLED"],
  CHANGES_REQUESTED: ["IN_REVIEW", "CANCELLED"],
  // No payment ever happens in this mode — approval goes straight to an
  // explicit creator release gate instead of PAYMENT_PENDING/PAID.
  APPROVED: ["CANCELLED", "AWAITING_CREATOR_RELEASE"],
  AWAITING_CREATOR_RELEASE: ["CANCELLED", "FILES_UNLOCKED"],
  FILES_UNLOCKED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_PENDING: [],
  PAID: [],
  CLOSED: [],
};

const PREVIEW_ONLY_TRANSITIONS: TransitionTable = {
  ...SHARED_PRE_REVIEW,
  // No APPROVED at all — a preview-only client can never approve for
  // delivery, pay, or claim a download grant. See DELIVERY_MODES.md.
  IN_REVIEW: ["CHANGES_REQUESTED", "CLOSED", "CANCELLED"],
  CHANGES_REQUESTED: ["IN_REVIEW", "CLOSED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
  APPROVED: [],
  PAYMENT_PENDING: [],
  PAID: [],
  FILES_UNLOCKED: [],
  DELIVERED: [],
  AWAITING_CREATOR_RELEASE: [],
};

const TRANSITIONS_BY_MODE: Record<DeliveryMode, TransitionTable> = {
  PAYMENT_REQUIRED: PAYMENT_REQUIRED_TRANSITIONS,
  APPROVAL_ONLY: APPROVAL_ONLY_TRANSITIONS,
  PREVIEW_ONLY: PREVIEW_ONLY_TRANSITIONS,
};

/** Throws InvalidStatusTransitionError if `to` is not a permitted transition from `from` under this workspace's delivery mode. A no-op transition (from === to) is never permitted — callers should check that separately if idempotency is desired. */
export function assertWorkspaceTransition(from: WorkspaceStatus, to: WorkspaceStatus, mode: DeliveryMode): void {
  if (!TRANSITIONS_BY_MODE[mode][from]?.includes(to)) {
    throw new InvalidStatusTransitionError(`Cannot move a ${mode} workspace from ${from} to ${to}.`);
  }
}

/** Read-only check (no throw) — useful for UI gating without a try/catch. */
export function canTransitionWorkspace(from: WorkspaceStatus, to: WorkspaceStatus, mode: DeliveryMode): boolean {
  return TRANSITIONS_BY_MODE[mode][from]?.includes(to) ?? false;
}
