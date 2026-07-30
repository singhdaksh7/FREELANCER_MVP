import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorProfile } from "./creator-profile";
import type { AuthenticatedCreator } from "@/data-access/auth";

// Avoids pulling the real Server Action (and its next-auth/next/server
// import chain, which Vitest's plain Node resolution can't follow) into
// this presentational-component test.
vi.mock("@/actions/auth", () => ({ logoutAction: vi.fn() }));

const creator: AuthenticatedCreator = {
  id: "usr_arjun",
  name: "Arjun Raj",
  email: "arjun@example.com",
  role: "CREATOR",
  image: "https://images.unsplash.com/photo-example.jpg",
};

describe("CreatorProfile", () => {
  it("renders the authenticated creator's name and email (not hardcoded mock identity)", () => {
    render(<CreatorProfile creator={creator} />);

    expect(screen.getByText("Arjun Raj")).toBeInTheDocument();
    expect(screen.getByText("arjun@example.com")).toBeInTheDocument();
  });

  it("falls back to initials when the creator has no profile image", () => {
    render(<CreatorProfile creator={{ ...creator, image: null }} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
  });

  it("renders logout as a real form submission (a Server Action), not a link", () => {
    render(<CreatorProfile creator={creator} />);

    const logoutButton = screen.getByRole("button", { name: /log out/i });
    expect(logoutButton).toHaveAttribute("type", "submit");
    expect(logoutButton.closest("form")).not.toBeNull();
  });
});
