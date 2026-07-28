import type { Client, Workspace } from "@/types";
import { formatINR } from "@/lib/format-currency";
import { formatDate } from "@/lib/format-date";
import { getClientLastActivity, getClientOutstanding } from "@/lib/client-metrics";

export interface ClientTableProps {
  clients: Client[];
  workspaces: Workspace[];
  caption: string;
  onDeferredAction: (message: string) => void;
}

/** Desktop table of clients. Edit/Delete are visibly present but not implemented — clicking shows a demo toast via `onDeferredAction`. */
export function ClientTable({ clients, workspaces, caption, onDeferredAction }: ClientTableProps) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface-card md:block">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-slate-50 text-[12px] uppercase text-ink-muted">
            <th scope="col" className="px-6 py-3 font-medium">Client</th>
            <th scope="col" className="px-6 py-3 font-medium">Email</th>
            <th scope="col" className="px-6 py-3 font-medium">Active Workspaces</th>
            <th scope="col" className="px-6 py-3 font-medium">Outstanding</th>
            <th scope="col" className="px-6 py-3 font-medium">Last Activity</th>
            <th scope="col" className="px-6 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const lastActivity = getClientLastActivity(client.id, workspaces);
            return (
              <tr key={client.id} className="border-b border-line last:border-b-0">
                <td className="px-6 py-4">
                  <div className="font-semibold text-ink">{client.name}</div>
                  <div className="text-xs text-ink-muted">{client.company}</div>
                </td>
                <td className="px-6 py-4 text-vault-blue">{client.email}</td>
                <td className="px-6 py-4 font-semibold text-ink">{client.activeWorkspaces}</td>
                <td className="px-6 py-4 font-semibold text-ink">
                  {formatINR(getClientOutstanding(client.id, workspaces))}
                </td>
                <td className="px-6 py-4 text-xs text-ink-muted">
                  {lastActivity ? formatDate(lastActivity) : "—"}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onDeferredAction(`Editing ${client.name} is available in a later phase.`)}
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeferredAction(`Deleting ${client.name} is available in a later phase.`)}
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
