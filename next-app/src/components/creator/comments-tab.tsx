"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Reply } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";
import { addCreatorCommentAction, resolveCommentAction, type ReviewCommentActionState } from "@/actions/review-comments";
import { formatDateTime } from "@/lib/format-date";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";
import type { WorkspaceFileListItem } from "@/data-access/files";

const INITIAL_STATE: ReviewCommentActionState = {};

function ResolveButton({ workspaceId, commentId }: { workspaceId: string; commentId: string }) {
  const [state, action, pending] = useActionState(resolveCommentAction, INITIAL_STATE);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="commentId" value={commentId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs font-semibold text-vault-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CheckCircle2 size={12} aria-hidden="true" /> {pending ? "Resolving…" : "Resolve"}
      </button>
      {state.error && <span className="ml-2 text-xs text-danger">{state.error}</span>}
    </form>
  );
}

function ReplyForm({ workspaceId, parentId }: { workspaceId: string; parentId: string }) {
  const [state, action, pending] = useActionState(addCreatorCommentAction, INITIAL_STATE);
  return (
    <form action={action} className="mt-2 flex gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="parentId" value={parentId} />
      <input
        name="body"
        placeholder="Reply…"
        maxLength={2000}
        required
        className="min-w-0 flex-1 rounded-md border border-line px-3 py-1.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Reply size={12} aria-hidden="true" /> {pending ? "Sending…" : "Reply"}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

function CommentCard({
  comment,
  workspaceId,
  fileLabel,
}: {
  comment: ReviewCommentThreadItem;
  workspaceId: string;
  fileLabel: string | null;
}) {
  return (
    <li className="rounded-md border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-ink">{comment.authorName}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {comment.authorType === "CLIENT" ? "Client" : "You"} · {formatDateTime(comment.createdAt)}
          </span>
          {fileLabel && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-ink-muted">{fileLabel}</span>}
        </div>
        {comment.status === "OPEN" ? (
          <ResolveButton workspaceId={workspaceId} commentId={comment.id} />
        ) : (
          <span className="text-xs font-semibold text-success">Resolved</span>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>

      {comment.replies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-l-2 border-line pl-3">
          {comment.replies.map((reply) => (
            <li key={reply.id}>
              <span className="text-xs font-semibold text-ink">{reply.authorName}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {reply.authorType === "CLIENT" ? "Client" : "You"} · {formatDateTime(reply.createdAt)}
              </span>
              <p className="whitespace-pre-wrap text-sm text-ink">{reply.body}</p>
            </li>
          ))}
        </ul>
      )}

      <ReplyForm workspaceId={workspaceId} parentId={comment.id} />
    </li>
  );
}

const ALL_FILES = "all";
const ALL_VERSIONS = "all";
type StatusFilter = "all" | "open" | "resolved";

export function CommentsTab({
  workspaceId,
  comments,
  files,
}: {
  workspaceId: string;
  comments: ReviewCommentThreadItem[];
  files: WorkspaceFileListItem[];
}) {
  const [fileFilter, setFileFilter] = useState<string>(ALL_FILES);
  const [versionFilter, setVersionFilter] = useState<string>(ALL_VERSIONS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const versionNumberById = useMemo(() => {
    const map = new Map<string, number>();
    for (const file of files) {
      for (const version of file.versions) map.set(version.id, version.versionNumber);
    }
    return map;
  }, [files]);

  const selectedFile = fileFilter === ALL_FILES ? null : fileById.get(fileFilter) ?? null;

  const filteredComments = comments.filter((comment) => {
    if (fileFilter !== ALL_FILES && comment.workspaceFileId !== fileFilter) return false;
    if (fileFilter !== ALL_FILES && versionFilter !== ALL_VERSIONS && comment.fileVersionId !== versionFilter) return false;
    if (statusFilter === "open" && comment.status !== "OPEN") return false;
    if (statusFilter === "resolved" && comment.status !== "RESOLVED") return false;
    return true;
  });

  function fileLabelFor(comment: ReviewCommentThreadItem): string | null {
    if (!comment.workspaceFileId) return null;
    const file = fileById.get(comment.workspaceFileId);
    if (!file) return null;
    const versionNumber = comment.fileVersionId ? versionNumberById.get(comment.fileVersionId) : undefined;
    return versionNumber ? `${file.displayName} · v${versionNumber}` : file.displayName;
  }

  if (comments.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No comments yet"
        description="Once a secure review link is shared, client comments and your replies will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-ink-muted">File</span>
          <select
            value={fileFilter}
            onChange={(e) => {
              setFileFilter(e.target.value);
              setVersionFilter(ALL_VERSIONS);
            }}
            className="rounded-md border border-line px-2 py-1.5 text-xs"
          >
            <option value={ALL_FILES}>All files</option>
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.displayName}
              </option>
            ))}
          </select>
        </label>

        {selectedFile && selectedFile.versions.length > 1 && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-muted">Version</span>
            <select
              value={versionFilter}
              onChange={(e) => setVersionFilter(e.target.value)}
              className="rounded-md border border-line px-2 py-1.5 text-xs"
            >
              <option value={ALL_VERSIONS}>All versions</option>
              {selectedFile.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="ml-auto flex gap-1">
          {(["all", "open", "resolved"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatusFilter(option)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold capitalize ${
                statusFilter === option ? "border-vault-blue bg-vault-blue text-white" : "border-line text-ink-muted hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {filteredComments.length === 0 ? (
        <p className="text-sm text-ink-muted">No comments match this filter.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredComments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} workspaceId={workspaceId} fileLabel={fileLabelFor(comment)} />
          ))}
        </ul>
      )}
    </div>
  );
}
