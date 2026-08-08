import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicNav } from "./public-nav";

describe("PublicNav", () => {
  it("renders the expected navigation links", () => {
    render(<PublicNav />);

    // "Log In" link → /login (Stitch design uses "Log In" label)
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: /get started/i }),
    ).toHaveAttribute("href", "/register");
    // Brand logo link → homepage
    expect(screen.getByRole("link", { name: /inlay/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
