import type { Metadata } from "next";
import { getNotifications } from "@/data-access/notifications";
import { SectionHeader } from "@/components/ui/section-header";
import { NotificationsList } from "@/components/creator/notifications-list";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <SectionHeader
        title="Notifications Feed"
        description="Real-time updates when clients view links, comment, approve, or pay"
      />
      <NotificationsList notifications={notifications} />
    </div>
  );
}
