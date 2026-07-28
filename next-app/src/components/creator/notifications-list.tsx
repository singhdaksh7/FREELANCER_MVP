"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationListItem } from "@/data-access/notifications";
import { EmptyState } from "@/components/ui/empty-state";
import { NotificationItem } from "./notification-item";

export interface NotificationsListProps {
  notifications: NotificationListItem[];
}

/**
 * Read/unread is local component state seeded from the mock data —
 * toggling it is a prototype-only visual change (labelled below) and is
 * never written back to any store, matching this phase's read-only
 * requirement for the notifications screen.
 */
export function NotificationsList({ notifications: initialNotifications }: NotificationsListProps) {
  const [notifications, setNotifications] = useState(initialNotifications);

  const toggleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)),
    );
  };

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications yet"
        description="You'll see comments, approvals, and payment updates here as clients interact with your workspaces."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Read status shown below is local to this browser tab for preview purposes only — it is not saved.
      </p>
      <ul className="overflow-hidden rounded-lg border border-line bg-surface-card">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onToggleRead={toggleRead} />
        ))}
      </ul>
    </div>
  );
}
