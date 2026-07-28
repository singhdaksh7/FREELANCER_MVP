import type { Metadata } from "next";
import { SectionHeader } from "@/components/ui/section-header";
import { ClientForm } from "@/components/creator/client-form";

export const metadata: Metadata = {
  title: "Add New Client",
};

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Add New Client" description="Create a client profile you can attach to a workspace." />
      <ClientForm mode="create" />
    </div>
  );
}
