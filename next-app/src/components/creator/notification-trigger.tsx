import Link from "next/link";
import { Bell } from "lucide-react";

export interface NotificationTriggerProps {
  unreadCount: number;
}

/** Header bell → /notifications, with an unread-count badge (matches the original CreatorLayout header bell). */
export function NotificationTrigger({ unreadCount }: NotificationTriggerProps) {
  return (
    <Link
      href="/notifications"
      className="relative rounded p-1.5 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications, no unread notifications"
      }
    >
      <Bell size={20} aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-vault-blue"
        />
      )}
    </Link>
  );
}
