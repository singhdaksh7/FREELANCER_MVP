"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Share2, Copy, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createReviewLinkAction,
  regenerateReviewLinkAction,
  revokeReviewLinkAction,
  type ReviewLinkActionState,
} from "@/actions/review-links";
import { formatDate } from "@/lib/format-date";

export interface ReviewLinkPanelProps {
  workspaceId: string;
  workspaceTitle: string;
  reviewLink: {
    status: string;
    tokenPrefix: string;
    /** null for a project-duration master link — never call this "permanent" in UI copy. */
    expiresAt: string | null;
    revokedAt: string | null;
    lastViewedAt: string | null;
    viewCount: number;
  } | null;
}

const INITIAL_STATE: ReviewLinkActionState = {};

/** Best-effort clipboard copy: Clipboard API first, falls back to a selectable read-only input for manual copy (e.g. no clipboard permission, non-HTTPS dev context). */
function useClipboardCopy() {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFallback(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallback(true);
    }
  }

  return { copied, fallback, copy };
}

function OneTimeLinkReveal({ rawLink, expiresAt }: { rawLink: string; expiresAt?: string | null }) {
  // Lazy initializer (not an effect): this component only ever mounts
  // client-side (rendered from a useActionState result after a form
  // submission), so `window` is always available here.
  const [fullUrl] = useState(() => `${window.location.origin}${rawLink}`);
  const inputRef = useRef<HTMLInputElement>(null);
  const { copied, fallback, copy } = useClipboardCopy();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-vault-blue/30 bg-vault-blue-light p-4">
      <p className="text-sm font-semibold text-ink">
        Secure review link created{expiresAt ? ` — expires ${formatDate(expiresAt)}` : ""}.
        {!expiresAt && (
          <span className="block font-normal text-ink-muted">
            Available for the duration of the project and retained according to your workspace history settings.
          </span>
        )}
      </p>
      <p className="text-xs text-ink-muted">
        Copy and share this link now. For security, the complete link is shown only this once — if it&apos;s lost,
        you&apos;ll need to regenerate it.
      </p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          data-testid="review-link-input"
          readOnly
          value={fullUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-xs text-ink"
        />
        <Button type="button" onClick={() => copy(fullUrl)} className="shrink-0">
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy Link"}
        </Button>
      </div>
      {fallback && (
        <p role="status" className="text-xs text-ink-muted">
          Clipboard access isn&apos;t available — the link above is selected; copy it manually (Ctrl/Cmd+C).
        </p>
      )}
    </div>
  );
}

function RegenerateDialog({ workspaceId, workspaceTitle }: { workspaceId: string; workspaceTitle: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(regenerateReviewLinkAction, INITIAL_STATE);
  const titleId = useId();

  useEffect(() => {
    if (state.rawLink) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      >
        Regenerate Link
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-card p-0 shadow-lg backdrop:bg-black/95"
      >
        <form action={formAction} className="flex flex-col gap-4 p-6">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <div>
            <h2 id={titleId} className="text-base font-bold text-ink">
              Regenerate the secure review link?
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              The current link for &quot;{workspaceTitle}&quot; will stop working immediately.
            </p>
          </div>
          {state.error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <Button type="submit" disabled={pending}>
              {pending ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </form>
      </dialog>
      {state.rawLink && <OneTimeLinkReveal rawLink={state.rawLink} expiresAt={state.expiresAt} />}
    </>
  );
}

/** Creator controls for the secure client review link: create / copy / revoke / regenerate. Replaces the Phase 4/5 disabled "Share Secure Link" placeholder. */
export function ReviewLinkPanel({ workspaceId, workspaceTitle, reviewLink }: ReviewLinkPanelProps) {
  const router = useRouter();
  const [createState, createAction, creating] = useActionState(createReviewLinkAction, INITIAL_STATE);

  const revealedLink = createState.rawLink;
  const revealedExpiry = createState.expiresAt;
  const error = createState.error;

  const isUsable = reviewLink && reviewLink.status === "ACTIVE";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Share2 size={14} aria-hidden="true" /> Secure Client Review Link
        </h3>
        <Link
          href={`/workspaces/${workspaceId}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          <Eye size={13} aria-hidden="true" /> Preview Client View
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {revealedLink ? (
        <OneTimeLinkReveal rawLink={revealedLink} expiresAt={revealedExpiry} />
      ) : reviewLink ? (
        <div className="flex flex-col gap-1 text-xs text-ink-muted">
          <span>
            Status: <span className="font-semibold text-ink">{reviewLink.status}</span> (token {reviewLink.tokenPrefix}
            …)
          </span>
          <span>
            {reviewLink.expiresAt
              ? `Expires ${formatDate(reviewLink.expiresAt)}`
              : "Available for the duration of the project and retained according to your workspace history settings."}
          </span>
          {reviewLink.viewCount > 0 && (
            <span>
              Viewed {reviewLink.viewCount} time{reviewLink.viewCount === 1 ? "" : "s"}
              {reviewLink.lastViewedAt ? ` (last ${formatDate(reviewLink.lastViewedAt)})` : ""}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          No review link has been created yet. Once created, the client can view protected previews, comment, request
          changes, and approve — without a creator account.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!isUsable && (
          <form action={createAction}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create Secure Review Link"}
            </Button>
          </form>
        )}

        {isUsable && (
          <>
            <RegenerateDialog workspaceId={workspaceId} workspaceTitle={workspaceTitle} />
            <ConfirmDialog
              triggerLabel="Revoke Link"
              triggerClassName="rounded-md border border-line px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              title="Revoke this review link?"
              description={`Anyone holding the current link for "${workspaceTitle}" will immediately lose access.`}
              confirmLabel="Revoke Link"
              pendingLabel="Revoking…"
              action={revokeReviewLinkAction}
              initialState={{}}
              hiddenFields={{ workspaceId }}
              destructive
              onSuccess={() => router.refresh()}
            />
          </>
        )}
      </div>
    </div>
  );
}
