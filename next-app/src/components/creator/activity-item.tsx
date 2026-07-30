export interface ActivityItemProps {
  action: string;
  user: string;
  timestamp: string;
  workspaceTitle?: string;
}

/** One row in the dashboard's "Recent Activity" feed. */
export function ActivityItem({ action, user, timestamp, workspaceTitle }: ActivityItemProps) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line py-2.5 text-[13px] last:border-b-0">
      <div>
        <strong className="text-ink">{action}</strong>
        <span className="ml-2 text-ink-muted">
          by {user}
          {workspaceTitle ? ` · ${workspaceTitle}` : ""}
        </span>
      </div>
      <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{timestamp}</span>
    </li>
  );
}
