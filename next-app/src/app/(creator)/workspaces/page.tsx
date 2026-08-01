import type { Metadata } from "next";
import { getWorkspaces } from "@/data-access/workspaces";
import { WorkspacesView } from "@/components/creator/workspaces-view";
import type { RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Workspaces",
};

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { workspaces, filters } = await getWorkspaces(await searchParams);

  return <WorkspacesView workspaces={workspaces} filters={filters} />;
}
