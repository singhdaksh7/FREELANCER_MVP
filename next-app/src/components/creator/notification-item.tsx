import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  IndianRupee,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import type { NotificationListItem } from "@/data-access/notifications";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format-date";

const TYPE_ICON: Record<string, LucideIcon> = {
  COMMENT: MessageSquare,
  CHANGES_REQUESTED: AlertTriangle,
  PROJECT_APPROVED: CheckCircle2,
  PAYMENT_COMPLETED: IndianRupee,
  FILES_DOWNLOADED: Download,
  PROCESSING_FAILED: AlertOctagon,
  SYSTEM: Bell,
};

export interface NotificationItemProps {
  notification: NotificationListItem;
  onToggleRead: (id: string) => void;
}

/** Unread state is shown with a dot AND explicit text for screen readers, never color alone. */
export function NotificationItem({ notification, onToggleRead }: NotificationItemProps) {
  const Icon = TYPE_ICON[notification.type] ?? Bell;

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => onToggleRead(notification.id)}
        aria-pressed={notification.read}
        className={cn(
          "flex w-full items-start justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vault-blue",
          !notification.read && "bg-vault-blue-light",
        )}
      >
        <div className="flex items-start gap-3">
          <Icon size={18} color="var(--color-vault-blue)" aria-hidden="true" className="mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              {!notification.read && (
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-vault-blue" />
              )}
              <p className="text-sm font-bold text-ink">{notification.title}</p>
            </div>
            <p className="mt-0.5 text-[13px] text-ink-muted">{notification.message}</p>
            <span className="sr-only">{notification.read ? "Read" : "Unread"}</span>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
          {formatDateTime(notification.createdAt)}
        </span>
      </button>
    </li>
  );
}
