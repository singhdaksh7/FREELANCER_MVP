import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentsTab } from "./comments-tab";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";

const { useRouter, refresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { useRouter: vi.fn(() => ({ refresh })), refresh };
});
vi.mock("next/navigation", () => ({ useRouter }));

function comment(overrides: Partial<ReviewCommentThreadItem> = {}): ReviewCommentThreadItem {
  return {
    id: "cmt_1",
    authorType: "CLIENT",
    authorName: "Rohit Sharma",
    body: "Please adjust the crop.",
    status: "OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    workspaceFileId: null,
    fileVersionId: null,
    pinX: null,
    pinY: null,
    pinNumber: null,
    resolvedAt: null,
    replies: [],
    ...overrides,
  };
}

/**
 * PHASE 7 regression coverage: reply/resolve used to run through
 * useActionState bound to Server Actions — the confirmed defect (see
 * review-e2e's "creator sees and replies"/"creator resolves the comment")
 * is that a correct, committed mutation could fail to visibly update the
 * UI, and separately that an unscoped `.first()` in the E2E test could
 * target the wrong comment card entirely. CommentsTab now owns local
 * thread state updated directly from each fetch's JSON response, so these
 * assert the JSON response alone — never a page reload or RSC merge — is
 * enough to show the right result on the right card.
 */
describe("CommentsTab reply", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replying inserts the new reply under the correct parent, with no page reload", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        reply: {
          id: "cmt_reply",
          parentId: "cmt_1",
          authorType: "CREATOR",
          authorName: "Arjun Raj",
          body: "Sure, updating now.",
          status: "OPEN",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      }),
    });

    render(<CommentsTab workspaceId="ws_1" comments={[comment()]} files={[]} />);

    const card = screen.getByTestId("creator-comment-card");
    await act(async () => {
      fireEvent.change(within(card).getByPlaceholderText(/reply/i), { target: { value: "Sure, updating now." } });
      fireEvent.click(within(card).getByRole("button", { name: /^reply$/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/comments/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: "cmt_1", body: "Sure, updating now." }),
    });
    expect(within(card).getByText("Sure, updating now.")).toBeInTheDocument();
    expect(within(card).getByPlaceholderText(/reply/i)).toHaveValue(""); // cleared only after confirmed success
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the entered text and shows an error on a handled failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This workspace could not be found." }),
    });

    render(<CommentsTab workspaceId="ws_1" comments={[comment()]} files={[]} />);

    const card = screen.getByTestId("creator-comment-card");
    await act(async () => {
      fireEvent.change(within(card).getByPlaceholderText(/reply/i), { target: { value: "Sure, updating now." } });
      fireEvent.click(within(card).getByRole("button", { name: /^reply$/i }));
    });

    expect(within(card).getByRole("alert")).toHaveTextContent("This workspace could not be found.");
    expect(within(card).getByPlaceholderText(/reply/i)).toHaveValue("Sure, updating now.");
    expect(within(card).queryByText("Sure, updating now.", { selector: "p" })).not.toBeInTheDocument();
  });

  it("submits a reply exactly once for a rapid double click", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<CommentsTab workspaceId="ws_1" comments={[comment()]} files={[]} />);
    const card = screen.getByTestId("creator-comment-card");
    fireEvent.change(within(card).getByPlaceholderText(/reply/i), { target: { value: "Sure, updating now." } });

    const replyButton = within(card).getByRole("button", { name: /^reply$/i });
    fireEvent.click(replyButton);
    fireEvent.click(replyButton);
    fireEvent.click(replyButton);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({
          success: true,
          reply: {
            id: "cmt_reply",
            parentId: "cmt_1",
            authorType: "CREATOR",
            authorName: "Arjun Raj",
            body: "Sure, updating now.",
            status: "OPEN",
            createdAt: "2026-01-01T00:01:00.000Z",
          },
        }),
      });
    });
  });

  it("only updates the targeted comment card when two cards are present", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        reply: {
          id: "cmt_reply",
          parentId: "cmt_1",
          authorType: "CREATOR",
          authorName: "Arjun Raj",
          body: "Reply to the first card.",
          status: "OPEN",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      }),
    });

    render(
      <CommentsTab
        workspaceId="ws_1"
        comments={[
          comment({ id: "cmt_1", body: "First comment." }),
          comment({ id: "cmt_2", body: "Second comment." }),
        ]}
        files={[]}
      />,
    );

    const cards = screen.getAllByTestId("creator-comment-card");
    const [firstCard, secondCard] = cards;

    await act(async () => {
      fireEvent.change(within(firstCard).getByPlaceholderText(/reply/i), { target: { value: "Reply to the first card." } });
      fireEvent.click(within(firstCard).getByRole("button", { name: /^reply$/i }));
    });

    expect(within(firstCard).getByText("Reply to the first card.")).toBeInTheDocument();
    expect(within(secondCard).queryByText("Reply to the first card.")).not.toBeInTheDocument();
    expect(within(secondCard).getByPlaceholderText(/reply/i)).toHaveValue("");
  });
});

describe("CommentsTab resolve", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolving shows Resolved locally with no page reload, and the Resolve control disappears", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Comment resolved." }),
    });

    render(<CommentsTab workspaceId="ws_1" comments={[comment()]} files={[]} />);
    const card = screen.getByTestId("creator-comment-card");

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /^resolve$/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/comments/cmt_1/resolve", { method: "POST" });
    expect(within(card).getByText("Resolved", { exact: true })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^resolve$/i })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an error and keeps the comment open on a handled failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This comment could not be found." }),
    });

    render(<CommentsTab workspaceId="ws_1" comments={[comment()]} files={[]} />);
    const card = screen.getByTestId("creator-comment-card");

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /^resolve$/i }));
    });

    expect(within(card).getByRole("alert")).toHaveTextContent("This comment could not be found.");
    expect(within(card).getByRole("button", { name: /^resolve$/i })).toBeInTheDocument();
    expect(within(card).queryByText("Resolved", { exact: true })).not.toBeInTheDocument();
  });

  it("submits a resolve request exactly once for a rapid double click", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );

    render(<CommentsTab workspaceId="ws_1" comments={[comment()]} files={[]} />);
    const card = screen.getByTestId("creator-comment-card");
    const resolveButton = within(card).getByRole("button", { name: /^resolve$/i });

    fireEvent.click(resolveButton);
    fireEvent.click(resolveButton);
    fireEvent.click(resolveButton);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, message: "Comment resolved." }) });
    });
  });

  it("only resolves the targeted comment card when two OPEN cards are present", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Comment resolved." }),
    });

    render(
      <CommentsTab
        workspaceId="ws_1"
        comments={[
          comment({ id: "cmt_1", body: "First comment." }),
          comment({ id: "cmt_2", body: "Second comment." }),
        ]}
        files={[]}
      />,
    );

    const cards = screen.getAllByTestId("creator-comment-card");
    const [firstCard, secondCard] = cards;

    await act(async () => {
      fireEvent.click(within(firstCard).getByRole("button", { name: /^resolve$/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/workspaces/ws_1/comments/cmt_1/resolve", { method: "POST" });
    expect(within(firstCard).getByText("Resolved", { exact: true })).toBeInTheDocument();
    // The second (untouched) card must still show its own Resolve control,
    // not silently flip to Resolved too — the exact `.first()`-style
    // targeting mistake this whole fix guards against.
    expect(within(secondCard).getByRole("button", { name: /^resolve$/i })).toBeInTheDocument();
    expect(within(secondCard).queryByText("Resolved", { exact: true })).not.toBeInTheDocument();
  });
});
