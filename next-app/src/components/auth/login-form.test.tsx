import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import type { AuthActionState } from "@/actions/auth";

const { loginAction } = vi.hoisted(() => ({ loginAction: vi.fn() }));
vi.mock("@/actions/auth", () => ({ loginAction }));

describe("LoginForm", () => {
  it("contains labelled email and password fields", () => {
    loginAction.mockResolvedValue({} satisfies AuthActionState);
    render(<LoginForm />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("shows the generic invalid-login message returned by the action, without hinting at the cause", async () => {
    loginAction.mockResolvedValue({
      error: "Invalid email or password.",
      values: { email: "nobody@example.com" },
    } satisfies AuthActionState);

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email address/i), "nobody@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });
});
