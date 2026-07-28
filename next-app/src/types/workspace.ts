export type WorkspaceStatus =
  | "Draft"
  | "Preview Processing"
  | "In Review"
  | "Changes Requested"
  | "Approved"
  | "Payment Pending"
  | "Paid";

export interface WorkspaceClientRef {
  id: string;
  name: string;
  company: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  size: string;
  type: string;
  previewUrl: string;
  isLocked: boolean;
}

export interface CommentReply {
  id: string;
  author: string;
  role: "Creator" | "Client";
  avatarUrl: string;
  timestamp: string;
  text: string;
}

export interface WorkspaceComment {
  id: string;
  author: string;
  role: "Creator" | "Client";
  avatarUrl: string;
  timestamp: string;
  text: string;
  fileId: string;
  version: string;
  status: "Open" | "Resolved";
  replies: CommentReply[];
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  user: string;
  /** Human-readable display timestamp, matching the original design (not parsed for sorting). */
  timestamp: string;
}

export interface Workspace {
  id: string;
  title: string;
  secureToken: string;
  client: WorkspaceClientRef;
  category: string;
  description: string;
  amount: number;
  status: WorkspaceStatus;
  /** ISO date (YYYY-MM-DD). */
  createdAt: string;
  /** ISO date (YYYY-MM-DD). Used to order "recent" workspaces/activity. */
  updatedAt: string;
  watermarkText: string;
  currentVersion: string;
  versions: string[];
  files: WorkspaceFile[];
  comments: WorkspaceComment[];
  activityLog: ActivityLogEntry[];
}
