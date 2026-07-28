import type { Metadata } from "next";
import { CLIENTS, WORKSPACES } from "@/data/mock";
import { ClientExplorer } from "@/components/creator/client-explorer";

export const metadata: Metadata = {
  title: "Clients",
};

export default function ClientsPage() {
  return <ClientExplorer clients={CLIENTS} workspaces={WORKSPACES} />;
}
