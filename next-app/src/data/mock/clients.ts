import type { Client } from "@/types";

/**
 * Ported from the original Vite INITIAL_CLIENTS mock (src/data/mockData.js).
 * Ananya Kapoor's `activeWorkspaces`/`status` were updated from the original
 * (0 / "Inactive") to (1 / "Active") to stay internally consistent with the
 * new "Social Media Campaign" workspace added for her in workspaces.ts —
 * see MIGRATION_STATUS.md.
 */
export const CLIENTS: Client[] = [
  {
    id: "cli_rohit",
    name: "Rohit Sharma",
    email: "rohit@designtech.io",
    company: "DesignTech Ltd",
    activeWorkspaces: 2,
    totalSpent: 75000,
    status: "Active",
  },
  {
    id: "cli_priya",
    name: "Priya Verma",
    email: "priya@fashioncraft.com",
    company: "FashionCraft",
    activeWorkspaces: 1,
    totalSpent: 45000,
    status: "Active",
  },
  {
    id: "cli_karan",
    name: "Karan Mehta",
    email: "karan@mehtadining.in",
    company: "Mehta Hospitality",
    activeWorkspaces: 1,
    totalSpent: 30000,
    status: "Active",
  },
  {
    id: "cli_ananya",
    name: "Ananya Kapoor",
    email: "ananya@luxeliving.co",
    company: "Luxe Living",
    activeWorkspaces: 1,
    totalSpent: 35000,
    status: "Active",
  },
];
