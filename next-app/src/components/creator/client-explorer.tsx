"use client";

import { useEffect, useState } from "react";
import { Plus, UserSearch, Users } from "lucide-react";
import type { ClientListItem } from "@/data-access/clients";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { Toast } from "@/components/ui/toast";
import { FlashToast } from "@/components/ui/flash-toast";
import { SectionHeader } from "@/components/ui/section-header";
import { useToastMessage } from "@/hooks/use-toast-message";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ClientTable } from "./client-table";
import { ClientCard } from "./client-card";

export interface ClientExplorerProps {
  /** Already filtered server-side by the current `q` search param — see src/data-access/clients.ts. */
  clients: ClientListItem[];
  /** True if the creator has zero clients at all (vs. zero matching the current search). */
  hasAnyClients: boolean;
}

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Search updates the `q` URL param (debounced) so filtering happens via a
 * database-backed Server Component re-render, not client-side array
 * filtering. Add/Edit navigate to real routes; Delete is a real mutation
 * gated by a confirm dialog (see src/actions/clients.ts).
 */
export function ClientExplorer({ clients, hasAnyClients }: ClientExplorerProps) {
  const { getParam, setParam } = useUrlFilters();
  const [search, setSearch] = useState(() => getParam("q"));
  const { toast, showToast } = useToastMessage();

  useEffect(() => {
    const timeout = setTimeout(() => setParam("q", search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when `search` itself changes
  }, [search]);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Clients Directory"
        description="Manage client profiles, past project deliverables, and payment histories"
        action={
          <LinkButton href="/clients/new">
            <Plus size={16} aria-hidden="true" /> Add New Client
          </LinkButton>
        }
      />

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Search by name, company, or email..."
        aria-label="Search clients"
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={hasAnyClients ? UserSearch : Users}
          title={hasAnyClients ? "No clients match your search" : "No clients yet"}
          description={
            hasAnyClients
              ? "Try a different name, company, or email address."
              : "Add your first client to start creating workspaces for them."
          }
        />
      ) : (
        <>
          <ClientTable
            clients={clients}
            caption="Clients matching the current search"
            onDeleted={(message) => showToast(message, "success")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onDeleted={(message) => showToast(message, "success")}
              />
            ))}
          </div>
        </>
      )}

      <Toast toast={toast} />
      <FlashToast />
    </div>
  );
}
