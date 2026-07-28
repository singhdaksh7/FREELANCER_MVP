"use client";

import { useState } from "react";
import { Plus, UserSearch, Users } from "lucide-react";
import type { Client, Workspace } from "@/types";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/ui/section-header";
import { useToastMessage } from "@/hooks/use-toast-message";
import { matchesSearch } from "@/lib/search";
import { ClientTable } from "./client-table";
import { ClientCard } from "./client-card";

export interface ClientExplorerProps {
  clients: Client[];
  workspaces: Workspace[];
}

/**
 * Search over the (mock) client list, plus the Add/Edit/Delete actions —
 * all of which are visually present but unimplemented in this phase and
 * show an "available in a later phase" toast instead of pretending to
 * save or delete anything.
 */
export function ClientExplorer({ clients, workspaces }: ClientExplorerProps) {
  const [search, setSearch] = useState("");
  const { toast, showToast } = useToastMessage();

  const filtered = clients.filter((client) =>
    matchesSearch(search, [client.name, client.company, client.email]),
  );

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
          icon={Users}
          title="No clients yet"
          description="Clients you invite into a workspace will appear here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title="No clients match your search"
          description="Try a different name, company, or email address."
        />
      ) : (
        <>
          <ClientTable
            clients={filtered}
            workspaces={workspaces}
            caption="Clients matching the current search"
            onDeferredAction={(message) => showToast(message, "info")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
            {filtered.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                workspaces={workspaces}
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
