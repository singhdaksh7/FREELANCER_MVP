export type NotificationType =
  | "comment"
  | "changes_requested"
  | "approval"
  | "payment"
  | "download"
  | "preview_failed"
  | "view";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  text: string;
  /** Human-readable display timestamp, matching the original design. */
  time: string;
  read: boolean;
  workspaceId?: string;
  clientName?: string;
}
