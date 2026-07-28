"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Reply, Send } from "lucide-react";
import { addReviewCommentAction, type ReviewClientActionState } from "@/actions/review";
import { formatDateTime } from "@/lib/format-date";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";

const INITIAL_STATE: ReviewClientActionState = {};

interface ReviewCommentsPanelProps {
  token: string;
  comments: ReviewCommentThreadItem[];
  activeFileId: string | null;
  reviewerName: string;
  onReviewerNameChange: (name: string) => void;
}

function ReplyForm({ token, parentId, reviewerName }: { token: string; parentId: string; reviewerName: string }) {
  const [state, action, pending] = useActionState(addReviewCommentAction, INITIAL_STATE);
  return (
    <form action={action} className="mt-2 flex gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="reviewerName" value={reviewerName} />
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

function CommentCard({ comment, token, reviewerName }: { comment: ReviewCommentThreadItem; token: string; reviewerName: string }) {
  const [showReply, setShowReply] = useState(false);
  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-ink">{comment.authorName}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {comment.authorType === "CREATOR" ? "Creator" : "You"} · {formatDateTime(comment.createdAt)}
          </span>
        </div>
        {comment.status === "RESOLVED" && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 size={12} aria-hidden="true" /> Resolved
          </span>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>

      {comment.replies.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3">
          {comment.replies.map((reply) => (
            <li key={reply.id}>
              <span className="text-xs font-semibold text-ink">{reply.authorName}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {reply.authorType === "CREATOR" ? "Creator" : "You"} · {formatDateTime(reply.createdAt)}
              </span>
              <p className="whitespace-pre-wrap text-sm text-ink">{reply.body}</p>
            </li>
          ))}
        </ul>
      )}

      {showReply ? (
        <ReplyForm token={token} parentId={comment.id} reviewerName={reviewerName} />
      ) : (
        <button type="button" onClick={() => setShowReply(true)} className="mt-2 text-xs font-semibold text-vault-blue hover:underline">
          Reply
        </button>
      )}
    </li>
  );
}

/** Comments panel — used inline on desktop and inside the mobile bottom sheet alike. */
export function ReviewCommentsPanel({ token, comments, activeFileId, reviewerName, onReviewerNameChange }: ReviewCommentsPanelProps) {
  const [state, action, pending] = useActionState(addReviewCommentAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-semibold text-ink-muted" htmlFor="reviewer-name">
          Your name
        </label>
        <input
          id="reviewer-name"
          value={reviewerName}
          onChange={(e) => onReviewerNameChange(e.target.value)}
          placeholder="Enter your name"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-ink-muted">No comments yet — be the first to leave one.</p>
      ) : (
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
          {comments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} token={token} reviewerName={reviewerName || "Reviewer"} />
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="reviewerName" value={reviewerName || "Reviewer"} />
        {activeFileId && <input type="hidden" name="workspaceFileId" value={activeFileId} />}
        <div className="flex gap-2">
          <input
            name="body"
            placeholder="Add a comment…"
            maxLength={2000}
            required
            className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-vault-blue px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={14} aria-hidden="true" /> {pending ? "Posting…" : "Post"}
          </button>
        </div>
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    </div>
  );
}
