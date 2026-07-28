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
    default:
      // Legacy/pre-Phase-4 rows already store a finished, human-readable
      // sentence directly in `action` — render it unchanged.
      return action;
  }
}
