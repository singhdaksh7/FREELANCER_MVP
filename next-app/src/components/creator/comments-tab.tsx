"use client";

import { useActionState } from "react";
import { CheckCircle2, Reply } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";
import { addCreatorCommentAction, resolveCommentAction, type ReviewCommentActionState } from "@/actions/review-comments";
import { formatDateTime } from "@/lib/format-date";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";

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

function CommentCard({ comment, workspaceId }: { comment: ReviewCommentThreadItem; workspaceId: string }) {
  return (
    <li className="rounded-md border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-ink">{comment.authorName}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {comment.authorType === "CLIENT" ? "Client" : "You"} · {formatDateTime(comment.createdAt)}
          </span>
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

export function CommentsTab({ workspaceId, comments }: { workspaceId: string; comments: ReviewCommentThreadItem[] }) {
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
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} workspaceId={workspaceId} />
      ))}
    </ul>
  );
}
