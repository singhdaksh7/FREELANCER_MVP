import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewLinkPanel } from "./review-link-panel";

const { useRouter, refresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { useRouter: vi.fn(() => ({ refresh })), refresh };
});
vi.mock("next/navigation", () => ({ useRouter }));

// Avoids pulling the real Server Actions (next-auth/next/server import
// chain) into this component test — regenerate/revoke aren't exercised here.
vi.mock("@/actions/review-links", () => ({
  regenerateReviewLinkAction: vi.fn(),
  revokeReviewLinkAction: vi.fn(),
}));

/**
 * PHASE 7 regression coverage: review-link creation used to hang on
 * "Creating…" forever when the Server Action's RSC response failed to
 * apply — it now goes through an explicit fetch() to
 * POST /api/workspaces/[id]/review-link (see confirmCreate in
 * review-link-panel.tsx), so these assert the JSON response alone is
 * enough to clear pending and reveal the one-time link.
 */
describe("ReviewLinkPanel create", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reveals the one-time link and clears pending after a successful create", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, rawLink: "/review/tok_abc123", expiresAt: null }),
    });

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create secure review link/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/review-link", { method: "POST" });
    expect(screen.getByTestId("review-link-input")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /creating…/i })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clears pending and shows the error after a handled failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Upload at least one file before creating a review link." }),
    });

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create secure review link/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Upload at least one file");
    expect(screen.getByRole("button", { name: /create secure review link/i })).not.toBeDisabled();
  });

  it("invokes fetch exactly once for a rapid double click", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={null} />);

    const button = screen.getByRole("button", { name: /create secure review link/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, rawLink: "/review/tok", expiresAt: null }) });
    });
  });
});

const activeReviewLink = {
  status: "ACTIVE",
  tokenPrefix: "tok_abc",
  expiresAt: null,
  revokedAt: null,
  lastViewedAt: null,
  viewCount: 0,
};

/**
 * PHASE 7 regression coverage for revoke/regenerate: both used to run
 * through ConfirmDialog's useActionState, with the same confirmed defect as
 * create — a correct, 200-OK response can fail to apply to the DOM. Both
 * now go through ConfirmFetchDialog + an explicit fetch() (see confirmRevoke
 * / confirmRegenerate in review-link-panel.tsx).
 */
describe("ReviewLinkPanel revoke", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Revoking… while pending and clears it once the request settles", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[1]);

    expect(screen.getByRole("button", { name: /revoking…/i })).toBeInTheDocument();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, message: "Review link revoked." }) });
    });

    expect(screen.queryByRole("button", { name: /revoking…/i })).not.toBeInTheDocument();
  });

  it("closes the confirmation dialog exactly once and shows Create Secure Review Link after success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Review link revoked." }),
    });

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[0]);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[1]);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/review-link/revoke", { method: "POST" });
    expect(screen.getByRole("button", { name: /create secure review link/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^revoke link$/i })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("preserves the active-link controls when revoke fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Something went wrong. Please try again." }),
    });

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[0]);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[1]);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.queryByRole("button", { name: /create secure review link/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^revoke link$/i }).length).toBeGreaterThan(0);
  });

  it("invokes fetch exactly once for a rapid double confirm click", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[0]);
    const confirmButton = screen.getAllByRole("button", { name: /^revoke link$/i })[1];
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, message: "Review link revoked." }) });
    });
  });

  it("does not leave the dialog stuck pending if router.refresh throws", async () => {
    refresh.mockImplementationOnce(() => {
      throw new Error("refresh failed");
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Review link revoked." }),
    });

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[0]);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^revoke link$/i })[1]);
    });

    expect(screen.queryByRole("button", { name: /revoking…/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create secure review link/i })).toBeInTheDocument();
  });
});

describe("ReviewLinkPanel regenerate", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Regenerating… while pending and clears it once the request settles", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getByRole("button", { name: /^regenerate link$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

    expect(screen.getByRole("button", { name: /regenerating…/i })).toBeInTheDocument();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, rawLink: "/review/tok_new", expiresAt: null }) });
    });

    expect(screen.queryByRole("button", { name: /regenerating…/i })).not.toBeInTheDocument();
  });

  it("reveals the new one-time link after a successful regenerate", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, rawLink: "/review/tok_new_123", expiresAt: null }),
    });

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getByRole("button", { name: /^regenerate link$/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/review-link/regenerate", { method: "POST" });
    expect((screen.getByTestId("review-link-input") as HTMLInputElement).value).toContain("/review/tok_new_123");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("invokes fetch exactly once for a rapid double confirm click", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<ReviewLinkPanel workspaceId="ws_1" workspaceTitle="Brand Shoot" reviewLink={activeReviewLink} />);
    fireEvent.click(screen.getByRole("button", { name: /^regenerate link$/i }));
    const confirmButton = screen.getByRole("button", { name: /^regenerate$/i });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, rawLink: "/review/tok_new", expiresAt: null }) });
    });
  });
});
