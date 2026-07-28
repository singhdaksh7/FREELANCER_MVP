import type { Workspace } from "@/types";

/** Sum of unpaid workspace amounts for a given client — derived, not stored on the Client record. */
export function getClientOutstanding(clientId: string, workspaces: Workspace[]): number {
  return workspaces
    .filter((w) => w.client.id === clientId && w.status !== "Paid")
    .reduce((sum, w) => sum + w.amount, 0);
}

/** Most recent `updatedAt` among a client's workspaces, or null if they have none. */
export function getClientLastActivity(clientId: string, workspaces: Workspace[]): string | null {
  const dates = workspaces.filter((w) => w.client.id === clientId).map((w) => w.updatedAt);
  if (dates.length === 0) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}
