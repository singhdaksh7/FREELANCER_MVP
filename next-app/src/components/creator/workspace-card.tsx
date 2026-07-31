import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { WorkspaceListItem } from "@/data-access/workspaces";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { workspaceStatusLabel } from "@/lib/status-labels";

export interface WorkspaceCardProps {
  workspace: WorkspaceListItem;
}

/** Mobile/tablet stacked-card presentation of a workspace (shown instead of WorkspaceTable below the md breakpoint). */
export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={workspaceStatusLabel(workspace.status)} />
      </div>

      <div>
        <h3 className="text-base font-bold text-ink">{workspace.title}</h3>
      </div>

      <dl className="grid grid-cols-2 gap-y-1.5 border-t border-line pt-3 text-[13px]">
        <dt className="text-ink-muted">Client</dt>
        <dd className="text-right font-medium text-ink">{workspace.clientName}</dd>
        <dt className="text-ink-muted">Amount</dt>
        <dd className="text-right font-semibold text-ink">{formatINR(workspace.amount)}</dd>
        <dt className="text-ink-muted">Progress</dt>
        <dd className="text-right text-ink">{workspace.progress}%</dd>
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
        {workspace.hasActiveReviewLink && (
          <span
            className="flex items-center justify-center gap-1 rounded-md bg-vault-navy px-3 py-2 text-xs font-semibold text-white"
            title="This workspace has an active secure review link. Manage or copy it from the workspace details page."
          >
            <ShieldCheck size={12} aria-hidden="true" /> Shared
          </span>
        )}
      </div>
    </div>
  );
}
