import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorNavigation } from "./creator-navigation";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

describe("CreatorNavigation", () => {
  it("renders the expected primary nav links", () => {
    usePathname.mockReturnValue("/dashboard");
    render(<CreatorNavigation unreadNotificationCount={0} />);

    for (const [label, href] of [
      ["Dashboard", "/dashboard"],
      ["Workspaces", "/workspaces"],
      ["Payments", "/payments"],
      ["Notifications", "/notifications"],
      ["Settings", "/settings"],
    ] as const) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toHaveAttribute("href", href);
    }
  });

  it("marks the link matching the current pathname as the active page", () => {
    usePathname.mockReturnValue("/workspaces");
    render(<CreatorNavigation unreadNotificationCount={0} />);

    expect(screen.getByRole("link", { name: "Workspaces" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("shows the unread notification count as a badge", () => {
    usePathname.mockReturnValue("/dashboard");
    render(<CreatorNavigation unreadNotificationCount={3} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
