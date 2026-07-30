export interface Creator {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  /** Lifetime stat, not derivable from the small demo workspace/client sets. */
  completedProjects: number;
  /** Lifetime stat, not derivable from the small demo workspace/client sets. */
  activeClients: number;
}
