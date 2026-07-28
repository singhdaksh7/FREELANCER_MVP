import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorMobileNav } from "./creator-mobile-nav";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

describe("CreatorMobileNav", () => {
  it("renders the expected primary destinations, excluding Settings (matching the original bottom nav's slice(0, 5))", () => {
    usePathname.mockReturnValue("/dashboard");
    render(<CreatorMobileNav />);

    const nav = screen.getByRole("navigation", { name: /primary/i });
    for (const label of ["Dashboard", "Workspaces", "Clients", "Payments", "Notifications"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(within(nav).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("marks the active destination for assistive tech", () => {
    usePathname.mockReturnValue("/payments");
    render(<CreatorMobileNav />);

    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("aria-current", "page");
  });
});
