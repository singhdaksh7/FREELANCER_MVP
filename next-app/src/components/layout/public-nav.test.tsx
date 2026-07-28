import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicNav } from "./public-nav";

describe("PublicNav", () => {
  it("renders the expected navigation links", () => {
    render(<PublicNav />);

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: /get started free/i }),
    ).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /project vault/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
