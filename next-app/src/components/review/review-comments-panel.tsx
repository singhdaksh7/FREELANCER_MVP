"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Reply, Send } from "lucide-react";
import { addReviewCommentAction, type ReviewClientActionState } from "@/actions/review";
import { formatDateTime } from "@/lib/format-date";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";

const INITIAL_STATE: ReviewClientActionState = {};

interface ReviewCommentsPanelProps {
  token: string;
  comments: ReviewCommentThreadItem[];
  activeFileId: string | null;
  /** Phase 7.5 — the currently-selected FileVersion; new comments are tagged with it, and the list below shows only this version's conversation. */
  activeVersionId: string | null;
  reviewerName: string;
  onReviewerNameChange: (name: string) => void;
  /** True once the workspace has reached a terminal status (DELIVERED/CLOSED) — history stays visible, but no new comment/reply can be submitted. */
  readOnly?: boolean;
  /** Phase 7.5 — normalized coordinates of a pin just placed on the image, awaiting its comment text. */
  pendingPin?: { x: number; y: number } | null;
  onPinCommentSubmitted?: () => void;
  highlightedCommentId?: string | null;
  onSelectComment?: (commentId: string) => void;
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
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        <Reply size={12} aria-hidden="true" /> {pending ? "Sending…" : "Reply"}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

function CommentCard({
  comment,
  token,
  reviewerName,
  readOnly,
  highlighted,
  onSelect,
}: {
  comment: ReviewCommentThreadItem;
  token: string;
  reviewerName: string;
  readOnly: boolean;
  highlighted?: boolean;
  onSelect?: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  return (
    <li
      onClick={onSelect}
      className={`rounded-md border p-3 ${highlighted ? "border-vault-blue bg-vault-blue/5" : "border-line"} ${onSelect ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-ink">{comment.authorName}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {comment.authorType === "CREATOR" ? "Creator" : "You"} · {formatDateTime(comment.createdAt)}
          </span>
          {comment.pinNumber !== null && (
            <span className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-vault-blue text-[10px] font-bold text-white">
              {comment.pinNumber}
            </span>
          )}
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

      {!readOnly &&
        (showReply ? (
          <ReplyForm token={token} parentId={comment.id} reviewerName={reviewerName} />
        ) : (
          <button type="button" onClick={() => setShowReply(true)} className="mt-2 text-xs font-semibold text-vault-blue hover:underline">
            Reply
          </button>
        ))}
    </li>
  );
}

/** Comments panel — used inline on desktop and inside the mobile bottom sheet alike. */
export function ReviewCommentsPanel({
  token,
  comments,
  activeFileId,
  activeVersionId,
  reviewerName,
  onReviewerNameChange,
  readOnly = false,
  pendingPin = null,
  onPinCommentSubmitted,
  highlightedCommentId = null,
  onSelectComment,
}: ReviewCommentsPanelProps) {
  const [state, action, pending] = useActionState(addReviewCommentAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success && pendingPin) onPinCommentSubmitted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the action's result changes
  }, [state]);

  // Version-specific conversations (Phase 7.5) — a comment left on v1 never
  // appears while viewing v2, and vice versa. General (no file selected)
  // comments are workspace-wide and always shown, in their own section.
  // See "Version-specific conversations" in REQUIREMENTS_ALIGNMENT.md.
  const versionComments = comments.filter(
    (c) => c.workspaceFileId === activeFileId && (activeVersionId === null || c.fileVersionId === activeVersionId),
  );
  const generalComments = comments.filter((c) => c.workspaceFileId === null);

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

      {versionComments.length === 0 ? (
        <p className="text-sm text-ink-muted">No comments yet on this version — be the first to leave one.</p>
      ) : (
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
          {versionComments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              token={token}
              reviewerName={reviewerName || "Reviewer"}
              readOnly={readOnly}
              highlighted={highlightedCommentId === comment.id}
              onSelect={onSelectComment ? () => onSelectComment(comment.id) : undefined}
            />
          ))}
        </ul>
      )}

      {generalComments.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold text-ink-muted">General project comments</p>
          <ul className="flex max-h-[240px] flex-col gap-2 overflow-y-auto">
            {generalComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                token={token}
                reviewerName={reviewerName || "Reviewer"}
                readOnly={readOnly}
              />
            ))}
          </ul>
        </div>
      )}

      {readOnly ? (
        <p className="border-t border-line pt-3 text-xs text-ink-muted">
          This project is closed — comments are read-only.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="reviewerName" value={reviewerName || "Reviewer"} />
          {activeFileId && <input type="hidden" name="workspaceFileId" value={activeFileId} />}
          {activeVersionId && <input type="hidden" name="fileVersionId" value={activeVersionId} />}
          {pendingPin && (
            <>
              <input type="hidden" name="pinX" value={pendingPin.x} />
              <input type="hidden" name="pinY" value={pendingPin.y} />
              <p className="text-xs font-semibold text-vault-blue">Pin placed — describe what needs to change here.</p>
            </>
          )}
          <div className="flex gap-2">
            <input
              name="body"
              placeholder={pendingPin ? "Describe this pin…" : "Add a comment…"}
              maxLength={2000}
              required
              className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md bg-vault-blue px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
            >
              <Send size={14} aria-hidden="true" /> {pending ? "Posting…" : "Post"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="text-xs text-danger">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
