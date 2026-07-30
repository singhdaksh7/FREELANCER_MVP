import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnedClientForEdit } from "@/data-access/clients";
import { SectionHeader } from "@/components/ui/section-header";
import { ClientForm } from "@/components/creator/client-form";

export const metadata: Metadata = {
  title: "Edit Client",
};

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getOwnedClientForEdit(id);

  // Never distinguishes "doesn't exist" from "belongs to another creator" — both render the same not-found page.
  if (!client) notFound();

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={`Edit ${client.name}`} description="Update this client's contact details." />
      <ClientForm
        mode="edit"
        clientId={client.id}
        initialValues={{
          name: client.name,
          email: client.email,
          company: client.company ?? "",
          phone: client.phone ?? "",
          notes: client.notes ?? "",
        }}
      />
    </div>
  );
}
