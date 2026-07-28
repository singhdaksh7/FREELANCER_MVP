import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClientExplorer } from "./client-explorer";
import { CLIENTS, WORKSPACES } from "@/data/mock";

describe("ClientExplorer", () => {
  it("returns only clients matching the search term", async () => {
    const user = userEvent.setup();
    render(<ClientExplorer clients={CLIENTS} workspaces={WORKSPACES} />);

    await user.type(screen.getByRole("searchbox", { name: /search clients/i }), "Priya");

    expect(screen.getAllByText("Priya Verma").length).toBeGreaterThan(0);
    expect(screen.queryByText("Rohit Sharma")).not.toBeInTheDocument();
  });

  it("shows an 'available in a later phase' toast instead of deleting a client", async () => {
    const user = userEvent.setup();
    render(<ClientExplorer clients={CLIENTS} workspaces={WORKSPACES} />);

    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(await screen.findByRole("status")).toHaveTextContent(/available in a later phase/i);
  });
});
