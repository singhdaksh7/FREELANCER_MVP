import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { WorkspaceListItem } from "@/data-access/workspaces";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { workspaceStatusLabel } from "@/lib/status-labels";

export interface WorkspaceTableProps {
  workspaces: WorkspaceListItem[];
  caption: string;
}

/**
 * Desktop table of workspaces (Title, Client, Amount, Status, Progress,
 * Last activity, Actions). `/workspaces/[id]` and `/review/[token]` are
 * deferred routes in this phase — the "Manage" link points there anyway
 * (resolving through not-found.tsx for now), matching the Phase 1 pattern
 * for destinations that will exist in a later phase. "Portal" only
 * renders once a workspace actually has a `publicToken` (i.e. has been
 * shared) — Phase 2's mock data assumed every workspace already had one.
 */
export function WorkspaceTable({ workspaces, caption }: WorkspaceTableProps) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface-card md:block">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-slate-50 text-[12px] uppercase text-ink-muted">
            <th scope="col" className="px-6 py-3 font-medium">Workspace</th>
            <th scope="col" className="px-6 py-3 font-medium">Client</th>
            <th scope="col" className="px-6 py-3 font-medium">Amount</th>
            <th scope="col" className="px-6 py-3 font-medium">Status</th>
            <th scope="col" className="px-6 py-3 font-medium">Progress</th>
            <th scope="col" className="px-6 py-3 font-medium">Last Activity</th>
            <th scope="col" className="px-6 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((workspace) => (
            <tr key={workspace.id} className="border-b border-line last:border-b-0">
              <td className="px-6 py-4">
                <div className="font-semibold text-ink">{workspace.title}</div>
              </td>
              <td className="px-6 py-4">
                <div className="font-medium text-ink">{workspace.client.name}</div>
                {workspace.client.company && (
                  <div className="text-xs text-ink-muted">{workspace.client.company}</div>
                )}
              </td>
              <td className="px-6 py-4 font-semibold text-ink">{formatINR(workspace.amount)}</td>
              <td className="px-6 py-4">
                <StatusBadge status={workspaceStatusLabel(workspace.status)} />
              </td>
              <td className="px-6 py-4 text-xs text-ink-muted">{workspace.progress}%</td>
              <td className="px-6 py-4 text-xs text-ink-muted">{formatDate(workspace.updatedAt)}</td>
              <td className="px-6 py-4">
                <div className="flex justify-end gap-2">
                  <Link
                    href={`/workspaces/${workspace.id}`}
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                  >
                    Manage
                  </Link>
                  {workspace.publicToken && (
                    <Link
                      href={`/review/${workspace.publicToken}`}
                      className="inline-flex items-center gap-1 rounded-md bg-vault-blue-light px-3 py-1.5 text-xs font-semibold text-vault-blue hover:bg-vault-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                    >
                      Portal <ExternalLink size={12} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
