import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./register-form";
import type { AuthActionState } from "@/actions/auth";

const { registerAction } = vi.hoisted(() => ({ registerAction: vi.fn() }));
vi.mock("@/actions/auth", () => ({ registerAction }));

describe("RegisterForm", () => {
  it("contains labelled name, email and password fields", () => {
    registerAction.mockResolvedValue({} satisfies AuthActionState);
    render(<RegisterForm />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("shows the duplicate-account error, and the returned state never carries a password value to repopulate the field with", async () => {
    const duplicateState: AuthActionState = {
      error: "An account with this email already exists.",
      values: { name: "Arjun Raj", email: "arjun@example.com" },
    };
    registerAction.mockResolvedValue(duplicateState);

    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/full name/i), "Arjun Raj");
    await user.type(screen.getByLabelText(/email address/i), "arjun@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Demo@12345");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
    expect(duplicateState.values).not.toHaveProperty("password");
  });

  it("shows server-side field validation errors", async () => {
    registerAction.mockResolvedValue({
      fieldErrors: { password: ["Password must be at least 8 characters long."] },
      values: { name: "Arjun Raj", email: "arjun@example.com" },
    } satisfies AuthActionState);

    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/full name/i), "Arjun Raj");
    await user.type(screen.getByLabelText(/email address/i), "arjun@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });
});
