"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Share2, Copy, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmFetchDialog } from "@/components/ui/confirm-fetch-dialog";
import { type ReviewLinkActionState } from "@/actions/review-links";
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

/** Creator controls for the secure client review link: create / copy / revoke / regenerate. Replaces the Phase 4/5 disabled "Share Secure Link" placeholder. */
export function ReviewLinkPanel({ workspaceId, workspaceTitle, reviewLink }: ReviewLinkPanelProps) {
  const router = useRouter();
  // PHASE 7 Route Handler fallback: creation used to run through
  // useActionState bound to createReviewLinkAction, but the confirmed
  // defect is that a correct, 200-OK Server Action response can fail to
  // apply to the DOM, leaving the button stuck on "Creating…" forever even
  // though the ReviewLink row was created. An explicit fetch() resolves in
  // the browser regardless of RSC-merge reliability, so `creating`
  // deterministically clears.
  const [creating, startCreateTransition] = useTransition();
  const [createState, setCreateState] = useState<ReviewLinkActionState>(INITIAL_STATE);
  const creatingRef = useRef(false);

  function handleCreate() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    startCreateTransition(async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/review-link`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setCreateState({ error: data.error ?? "Something went wrong. Please try again." });
          return;
        }
        setCreateState({ success: "Secure review link created.", rawLink: data.rawLink, expiresAt: data.expiresAt });
        router.refresh();
      } finally {
        creatingRef.current = false;
      }
    });
  }

  // PHASE 7 Route Handler fallback: revoke/regenerate used to run through
  // ConfirmDialog's useActionState — same confirmed defect as create above.
  // `locallyRevoked` hides the active-link controls and reveals Create
  // Secure Review Link the instant the explicit fetch() resolves,
  // independent of whether the subsequent router.refresh() below ever
  // lands. It's reset whenever the server-provided reviewLink prop itself
  // changes (a real refresh landing, or a brand-new link created later) —
  // adjusted during render (React's "you might not need an effect" pattern)
  // rather than in a useEffect, so it never permanently overrides fresh
  // server state without an extra render's worth of stale UI.
  const reviewLinkKey = `${reviewLink?.tokenPrefix ?? ""}:${reviewLink?.status ?? ""}`;
  const [locallyRevoked, setLocallyRevoked] = useState(false);
  const [lastSeenReviewLinkKey, setLastSeenReviewLinkKey] = useState(reviewLinkKey);
  const [regeneratedLink, setRegeneratedLink] = useState<{ rawLink: string; expiresAt: string | null } | null>(null);

  if (reviewLinkKey !== lastSeenReviewLinkKey) {
    setLastSeenReviewLinkKey(reviewLinkKey);
    setLocallyRevoked(false);
  }

  async function confirmRevoke() {
    const response = await fetch(`/api/workspaces/${workspaceId}/review-link/revoke`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data.error ?? "Something went wrong. Please try again." };
    setLocallyRevoked(true);
    setRegeneratedLink(null);
    // Best-effort reconciliation only — the local state above is already
    // the durable success signal, so a refresh failure must never leave
    // this dialog's pending state stuck.
    try {
      router.refresh();
    } catch {
      // ignored
    }
    return {};
  }

  async function confirmRegenerate() {
    const response = await fetch(`/api/workspaces/${workspaceId}/review-link/regenerate`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data.error ?? "Something went wrong. Please try again." };
    setRegeneratedLink({ rawLink: data.rawLink, expiresAt: data.expiresAt ?? null });
    try {
      router.refresh();
    } catch {
      // ignored
    }
    return {};
  }

  const revealedLink = regeneratedLink?.rawLink ?? createState.rawLink;
  const revealedExpiry = regeneratedLink ? regeneratedLink.expiresAt : createState.expiresAt;
  const error = createState.error;

  const isUsable = !locallyRevoked && reviewLink && reviewLink.status === "ACTIVE";

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
      ) : reviewLink && !locallyRevoked ? (
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
          <Button type="button" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Create Secure Review Link"}
          </Button>
        )}

        {isUsable && (
          <>
            <ConfirmFetchDialog
              triggerLabel="Regenerate Link"
              triggerClassName="inline-flex items-center gap-1.5 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              title="Regenerate the secure review link?"
              description={`The current link for "${workspaceTitle}" will stop working immediately.`}
              confirmLabel="Regenerate"
              pendingLabel="Regenerating…"
              onConfirm={confirmRegenerate}
            />
            <ConfirmFetchDialog
              triggerLabel="Revoke Link"
              triggerClassName="rounded-md border border-line px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              title="Revoke this review link?"
              description={`Anyone holding the current link for "${workspaceTitle}" will immediately lose access.`}
              confirmLabel="Revoke Link"
              pendingLabel="Revoking…"
              onConfirm={confirmRevoke}
              destructive
            />
          </>
        )}
      </div>
    </div>
  );
}
