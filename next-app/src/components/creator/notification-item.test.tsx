import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationItem } from "./notification-item";
import type { NotificationListItem } from "@/data-access/notifications";

const unread: NotificationListItem = {
  id: "notif_test_unread",
  type: "COMMENT",
  title: "New Comment on Test Workspace",
  message: "Someone left a comment.",
  read: false,
  workspaceTitle: "Test Workspace",
  createdAt: "2026-07-28T08:00:00.000Z",
};

const read: NotificationListItem = { ...unread, id: "notif_test_read", read: true };

describe("NotificationItem", () => {
  it("exposes unread state as text for assistive tech, not color alone", () => {
    render(<NotificationItem notification={unread} onToggleRead={vi.fn()} />);
    expect(screen.getByText("Unread")).toBeInTheDocument();
  });

  it("exposes read state as text once toggled", () => {
    render(<NotificationItem notification={read} onToggleRead={vi.fn()} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });
});
