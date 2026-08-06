"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkspaceListItem } from "@/data-access/workspaces";

export interface WorkspaceCardProps {
  workspace: WorkspaceListItem;
}

interface LinkState {
  rawLink?: string;
  expiresAt?: string;
  error?: string;
}

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

export function InlineLinkGenerator({ workspaceId, hasActiveReviewLink }: { workspaceId: string; hasActiveReviewLink: boolean }) {
  const [state, setState] = useState<LinkState>({});
  const [pending, setPending] = useState(false);
  const { copied, copy } = useClipboardCopy();

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setState({});
    try {
      const endpoint = hasActiveReviewLink
        ? `/api/workspaces/${workspaceId}/review-link/regenerate`
        : `/api/workspaces/${workspaceId}/review-link`;
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ error: data.error ?? "Something went wrong. Please try again." });
      } else {
        setState({ rawLink: data.rawLink, expiresAt: data.expiresAt });
      }
    } catch (error) {
      setState({ error: "Network error occurred." });
    } finally {
      setPending(false);
    }
  }

  if (state.rawLink) {
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${state.rawLink}` : state.rawLink;
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-md bg-vault-blue-light/50 p-3 border border-vault-blue/20">
        <p className="text-xs font-semibold text-vault-blue">Secure review link ready:</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={fullUrl}
            className="flex-1 rounded-md border border-line px-2 py-1.5 text-xs text-ink bg-white font-mono"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={() => copy(fullUrl)}
            className="shrink-0 rounded-md bg-vault-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-vault-blue-dark"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleGenerate} className="mt-4">
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-line py-2 text-center text-xs font-semibold text-ink hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Generating Link…" : hasActiveReviewLink ? "Generate New Link" : "Generate Link"}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/** Mobile/tablet stacked-card presentation of a workspace (shown instead of WorkspaceTable below the md breakpoint). */
export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const isActionable = workspace.status !== "CANCELLED" && workspace.status !== "DELIVERED" && workspace.status !== "CLOSED";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-5">
      <div>
        <h3 className="text-base font-bold text-ink">{workspace.title}</h3>
        <p className="text-xs font-medium text-ink-muted">{workspace.clientName}</p>
      </div>

      <div>
        <p className="inline-block rounded-md bg-vault-blue-light/50 px-2.5 py-1 text-xs font-semibold text-vault-blue">
          {workspace.derivedProgress}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-line">
        <Link
          href={`/workspaces/${workspace.id}`}
          className="flex-1 rounded-md bg-app-bg border border-line py-2 text-center text-xs font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          Manage Details
        </Link>
      </div>

      {isActionable && <InlineLinkGenerator workspaceId={workspace.id} hasActiveReviewLink={workspace.hasActiveReviewLink} />}
    </div>
  );
}
