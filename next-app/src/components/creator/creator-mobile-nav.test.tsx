import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorMobileNav } from "./creator-mobile-nav";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

describe("CreatorMobileNav", () => {
  it("renders all 5 primary destinations, including Settings (Phase 8 removed Clients/Support, so the full nav now fits the bottom bar)", () => {
    usePathname.mockReturnValue("/dashboard");
    render(<CreatorMobileNav />);

    const nav = screen.getByRole("navigation", { name: /primary/i });
    for (const label of ["Dashboard", "Workspaces", "Payments", "Notifications", "Settings"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the active destination for assistive tech", () => {
    usePathname.mockReturnValue("/payments");
    render(<CreatorMobileNav />);

    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("aria-current", "page");
  });
});
