import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WorkspaceExplorer } from "./workspace-explorer";
import { WORKSPACES } from "@/data/mock";

describe("WorkspaceExplorer", () => {
  it("filters to workspaces matching the search term without mutating the source list", async () => {
    const user = userEvent.setup();
    const originalLength = WORKSPACES.length;
    render(<WorkspaceExplorer workspaces={WORKSPACES} />);

    await user.type(screen.getByRole("searchbox", { name: /search workspaces/i }), "Brand Identity");

    expect(screen.getAllByText("Brand Identity Design").length).toBeGreaterThan(0);
    expect(screen.queryByText("E-commerce Website UI")).not.toBeInTheDocument();
    expect(WORKSPACES.length).toBe(originalLength);
  });

  it("shows a no-results state when nothing matches the search", async () => {
    const user = userEvent.setup();
    render(<WorkspaceExplorer workspaces={WORKSPACES} />);

    await user.type(
      screen.getByRole("searchbox", { name: /search workspaces/i }),
      "no workspace has this title",
    );

    expect(screen.getByText(/no workspaces match your search/i)).toBeInTheDocument();
  });
});
