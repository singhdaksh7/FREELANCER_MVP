import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientExplorer } from "./client-explorer";
import type { ClientListItem } from "@/data-access/clients";

const { useRouter, usePathname, useSearchParams } = vi.hoisted(() => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
  usePathname: vi.fn(() => "/clients"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock("next/navigation", () => ({ useRouter, usePathname, useSearchParams }));

const CLIENTS: ClientListItem[] = [
  {
    id: "cli_rohit",
    name: "Rohit Sharma",
    email: "rohit@designtech.io",
    company: "DesignTech Ltd",
    activeWorkspaceCount: 1,
    outstandingAmount: 25000,
    lastActivityAt: "2026-07-28T08:30:00.000Z",
    status: "Active",
  },
  {
    id: "cli_priya",
    name: "Priya Verma",
    email: "priya@fashioncraft.com",
    company: "FashionCraft",
    activeWorkspaceCount: 1,
    outstandingAmount: 45000,
    lastActivityAt: "2026-07-27T16:20:00.000Z",
    status: "Active",
  },
];

describe("ClientExplorer", () => {
  it("renders the clients passed to it (already filtered server-side)", () => {
    render(<ClientExplorer clients={CLIENTS} hasAnyClients />);

    expect(screen.getAllByText("Priya Verma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rohit Sharma").length).toBeGreaterThan(0);
  });

  it("shows an 'available in a later phase' toast instead of deleting a client", async () => {
    const user = userEvent.setup();
    render(<ClientExplorer clients={CLIENTS} hasAnyClients />);

    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(await screen.findByRole("status")).toHaveTextContent(/available in a later phase/i);
  });

  it("shows a no-clients empty state when the creator has none at all", () => {
    render(<ClientExplorer clients={[]} hasAnyClients={false} />);
    expect(screen.getByText(/no clients yet/i)).toBeInTheDocument();
  });

  it("shows a no-results empty state when a search matches nothing", () => {
    render(<ClientExplorer clients={[]} hasAnyClients />);
    expect(screen.getByText(/no clients match your search/i)).toBeInTheDocument();
  });
});
