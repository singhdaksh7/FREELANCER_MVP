"use client";

import { useEffect, useState } from "react";
import { Plus, UserSearch, Users } from "lucide-react";
import type { ClientListItem } from "@/data-access/clients";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
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
 * filtering. Add/Edit/Delete are visibly present but unimplemented in
 * this phase and show an "available in a later phase" toast instead of
 * pretending to save or delete anything.
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
          <Button onClick={() => showToast("Adding a new client is available in a later phase.", "info")}>
            <Plus size={16} aria-hidden="true" /> Add New Client
          </Button>
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
              : "Clients you invite into a workspace will appear here."
          }
        />
      ) : (
        <>
          <ClientTable
            clients={clients}
            caption="Clients matching the current search"
            onDeferredAction={(message) => showToast(message, "info")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onDeferredAction={(message) => showToast(message, "info")}
              />
            ))}
          </div>
        </>
      )}

      <Toast toast={toast} />
    </div>
  );
}
