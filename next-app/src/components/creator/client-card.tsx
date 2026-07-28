import { Building } from "lucide-react";
import type { ClientListItem } from "@/data-access/clients";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";

export interface ClientCardProps {
  client: ClientListItem;
  onDeferredAction: (message: string) => void;
}

export function ClientCard({ client, onDeferredAction }: ClientCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">{client.name}</h3>
          {client.company && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <Building size={13} aria-hidden="true" /> {client.company}
            </p>
          )}
        </div>
        <StatusBadge status={client.status} />
      </div>

      <dl className="grid grid-cols-2 gap-y-1.5 border-t border-line pt-3 text-[13px]">
        <dt className="text-ink-muted">Email</dt>
        <dd className="truncate text-right font-medium text-vault-blue">{client.email}</dd>
        <dt className="text-ink-muted">Active workspaces</dt>
        <dd className="text-right font-medium text-ink">{client.activeWorkspaceCount}</dd>
        <dt className="text-ink-muted">Outstanding</dt>
        <dd className="text-right font-semibold text-ink">{formatINR(client.outstandingAmount)}</dd>
        <dt className="text-ink-muted">Last activity</dt>
        <dd className="text-right text-ink">
          {client.lastActivityAt ? formatDate(client.lastActivityAt) : "—"}
        </dd>
      </dl>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onDeferredAction(`Editing ${client.name} is available in a later phase.`)}
          className="flex-1 rounded-md border border-line py-2 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDeferredAction(`Deleting ${client.name} is available in a later phase.`)}
          className="flex-1 rounded-md border border-line py-2 text-xs font-semibold text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
