import type { Metadata } from "next";
import { getOwnedWorkspaceDetail } from "@/data-access/workspaces";
import { SectionHeader } from "@/components/ui/section-header";
import { SupportTicketForm } from "@/components/creator/support-ticket-form";

export const metadata: Metadata = {
  title: "Raise a Ticket",
};

export default async function NewSupportTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const { workspaceId } = await searchParams;
  const workspace = workspaceId ? await getOwnedWorkspaceDetail(workspaceId) : null;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Raise a Support Ticket" description="We'll get back to you as soon as possible" />
      <SupportTicketForm workspaceId={workspace ? workspaceId : undefined} workspaceTitle={workspace?.title} />
    </div>
  );
}
