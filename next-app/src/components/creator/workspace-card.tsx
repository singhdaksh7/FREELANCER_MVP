import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Workspace } from "@/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { getWorkspaceProgress } from "@/lib/workspace-progress";

export interface WorkspaceCardProps {
  workspace: Workspace;
}

/** Mobile/tablet stacked-card presentation of a workspace (shown instead of WorkspaceTable below the md breakpoint). */
export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={workspace.status} />
        <span className="rounded bg-vault-blue-light px-2 py-0.5 text-xs font-bold text-vault-blue">
          {workspace.currentVersion.toUpperCase()}
        </span>
      </div>

      <div>
        <h3 className="text-base font-bold text-ink">{workspace.title}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{workspace.category}</p>
      </div>

      <dl className="grid grid-cols-2 gap-y-1.5 border-t border-line pt-3 text-[13px]">
        <dt className="text-ink-muted">Client</dt>
        <dd className="text-right font-medium text-ink">{workspace.client.name}</dd>
        <dt className="text-ink-muted">Amount</dt>
        <dd className="text-right font-semibold text-ink">{formatINR(workspace.amount)}</dd>
        <dt className="text-ink-muted">Progress</dt>
        <dd className="text-right text-ink">{getWorkspaceProgress(workspace.status)}%</dd>
        <dt className="text-ink-muted">Last activity</dt>
        <dd className="text-right text-ink">{formatDate(workspace.updatedAt)}</dd>
      </dl>

      <div className="flex gap-2 pt-1">
        <Link
          href={`/workspaces/${workspace.id}`}
          className="flex-1 rounded-md border border-line py-2 text-center text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          Manage Details
        </Link>
        <Link
          href={`/review/${workspace.secureToken}`}
          className="flex items-center justify-center gap-1 rounded-md bg-vault-navy px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          Portal <ExternalLink size={12} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
