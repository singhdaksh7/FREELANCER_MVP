import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";

export interface NotificationListItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  workspaceTitle: string | null;
  createdAt: string;
}

/** All of the authenticated creator's notifications, newest first. No filters — the approved design never had any (verified against source). */
export async function getNotifications(): Promise<NotificationListItem[]> {
  const creator = await requireAuthenticatedUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: creator.id },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: { workspace: { select: { title: true } } },
  });

  return notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    workspaceTitle: n.workspace?.title ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const creator = await requireAuthenticatedUser();
  return prisma.notification.count({ where: { userId: creator.id, read: false } });
}
