import type { Metadata } from "next";
import { getClients } from "@/data-access/clients";
import { ClientExplorer } from "@/components/creator/client-explorer";
import type { RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Clients",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { clients, hasAnyClients } = await getClients(await searchParams);

  return <ClientExplorer clients={clients} hasAnyClients={hasAnyClients} />;
}
