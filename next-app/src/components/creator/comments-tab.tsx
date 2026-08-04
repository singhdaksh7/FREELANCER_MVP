"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Reply } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/format-date";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";
import type { WorkspaceFileListItem } from "@/data-access/files";

/**
 * PHASE 7 Route Handler fallback for creator replies/resolves (see the
 * review-link and file-delete routes for the same rationale). The
 * `useActionState`-driven Server Action version left a reply or resolve
 * correctly committed server-side while the browser never reliably applied
 * the `revalidatePath` RSC response — CommentsTab now owns local
 * comment-thread state, seeded once from the `comments` prop (this
 * component unmounts/remounts on every Comments-tab activation — see
 * WorkspaceDetailTabs — so that's also when it naturally re-syncs with the
 * server), and each successful fetch updates that local state directly
 * rather than waiting on a revalidated render to arrive.
 */

function ResolveButton({
  workspaceId,
  commentId,
  onResolveSuccess,
}: {
  workspaceId: string;
  commentId: string;
  onResolveSuccess: (commentId: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pendingRef = useRef(false);

  async function handleClick() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/comments/${commentId}/resolve`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      onResolveSuccess(commentId);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs font-semibold text-vault-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CheckCircle2 size={12} aria-hidden="true" /> {pending ? "Resolving…" : "Resolve"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

function ReplyForm({
  workspaceId,
  parentId,
  onReplySuccess,
}: {
  workspaceId: string;
  parentId: string;
  onReplySuccess: (parentId: string, reply: ReviewCommentThreadItem) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pendingRef = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const trimmed = body.trim();
    if (!trimmed) return;

    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/comments/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, body: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return; // keep the entered text so nothing is lost on failure
      }
      onReplySuccess(parentId, { ...data.reply, replies: [] });
      setBody(""); // only clear after confirmed success
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
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
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </form>
  );
}

function CommentCard({
  comment,
  workspaceId,
  fileLabel,
  onReplySuccess,
  onResolveSuccess,
}: {
  comment: ReviewCommentThreadItem;
  workspaceId: string;
  fileLabel: string | null;
  onReplySuccess: (parentId: string, reply: ReviewCommentThreadItem) => void;
  onResolveSuccess: (commentId: string) => void;
}) {
  return (
    <li data-testid="creator-comment-card" data-comment-id={comment.id} className="rounded-md border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-ink">{comment.authorName}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {comment.authorType === "CLIENT" ? "Client" : "You"} · {formatDateTime(comment.createdAt)}
          </span>
          {fileLabel && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-ink-muted">{fileLabel}</span>}
        </div>
        {comment.status === "OPEN" ? (
          <ResolveButton workspaceId={workspaceId} commentId={comment.id} onResolveSuccess={onResolveSuccess} />
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

      <ReplyForm workspaceId={workspaceId} parentId={comment.id} onReplySuccess={onReplySuccess} />
    </li>
  );
}

const ALL_FILES = "all";
const ALL_VERSIONS = "all";
type StatusFilter = "all" | "open" | "resolved";

export function CommentsTab({
  workspaceId,
  comments: initialComments,
  files,
}: {
  workspaceId: string;
  comments: ReviewCommentThreadItem[];
  files: WorkspaceFileListItem[];
}) {
  const router = useRouter();
  // Seeded once from the server-rendered prop — this component unmounts on
  // every tab switch away from Comments (see WorkspaceDetailTabs' `activeTab
  // === "comments" &&` guard) and remounts fresh on the next activation, so
  // that's the natural resync point; within a single mount, our own
  // confirmed mutations are the source of visible truth, not a revalidated
  // render that may or may not arrive.
  const [comments, setComments] = useState<ReviewCommentThreadItem[]>(initialComments);
  const [fileFilter, setFileFilter] = useState<string>(ALL_FILES);
  const [versionFilter, setVersionFilter] = useState<string>(ALL_VERSIONS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  function handleReplySuccess(parentId: string, reply: ReviewCommentThreadItem): void {
    setComments((prev) => prev.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, reply] } : c)));
    router.refresh(); // canonical reconciliation only — visible correctness never depends on this landing
  }

  function handleResolveSuccess(commentId: string): void {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, status: "RESOLVED", resolvedAt: new Date().toISOString() } : c)),
    );
    router.refresh();
  }

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
            <CommentCard
              key={comment.id}
              comment={comment}
              workspaceId={workspaceId}
              fileLabel={fileLabelFor(comment)}
              onReplySuccess={handleReplySuccess}
              onResolveSuccess={handleResolveSuccess}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
