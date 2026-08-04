import { getStatusStyle } from "@/lib/status-config";

export interface StatusBadgeProps {
  status: string;
  "data-testid"?: string;
}

/**
 * Color-coded status pill. Purely presentational — colors are resolved
 * from the centralized status configuration in @/lib/status-config so
 * no screen ever redefines the status → color mapping locally.
 */
export function StatusBadge({ status, "data-testid": testId }: StatusBadgeProps) {
  const { background, color } = getStatusStyle(status);

  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: background, color }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {status}
    </span>
  );
}
