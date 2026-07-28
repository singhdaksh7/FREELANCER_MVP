export type ClientStatus = "Active" | "Inactive";

export interface Client {
  id: string;
  name: string;
  email: string;
  company: string;
  activeWorkspaces: number;
  totalSpent: number;
  status: ClientStatus;
}
