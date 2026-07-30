import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicNav } from "@/components/layout/public-nav";
import { PublicFooter } from "@/components/layout/public-footer";
import { AdminShell } from "@/components/admin/admin-shell";
import { LoginForm } from "@/components/auth/login-form";
import { BRAND } from "./branding";

const { loginAction } = vi.hoisted(() => ({ loginAction: vi.fn() }));
vi.mock("@/actions/auth", () => ({ loginAction }));

/**
 * Guards the INLAY rebrand: none of the public-facing screens rebuilt in
 * this pass should ever regress back to rendering the old "Project Vault"
 * name. Each case both renders a real component and confirms it shows the
 * new brand name, so this fails loudly if the branding import is ever
 * reverted or bypassed with a hardcoded string.
 */
describe("no old Project Vault branding renders on public screens", () => {
  it("marketing nav shows INLAY, not the old name", () => {
    render(<PublicNav />);
    expect(screen.queryByText(/project vault/i)).not.toBeInTheDocument();
    expect(screen.getByText(BRAND.productName)).toBeInTheDocument();
  });

  it("marketing footer shows INLAY, not the old name", () => {
    render(<PublicFooter />);
    expect(screen.queryByText(/project vault/i)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(BRAND.productName, "i"))).toBeInTheDocument();
  });

  it("admin shell shows INLAY Administration, not the old name", () => {
    render(
      <AdminShell adminName="Test Admin">
        <div />
      </AdminShell>,
    );
    expect(screen.queryByText(/project vault/i)).not.toBeInTheDocument();
    expect(screen.getByText(BRAND.adminName)).toBeInTheDocument();
  });

  it("login screen shows INLAY, not the old name", () => {
    loginAction.mockResolvedValue({});
    render(<LoginForm />);
    expect(screen.queryByText(/project vault/i)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`sign in to ${BRAND.productName}`, "i"))).toBeInTheDocument();
  });
});
