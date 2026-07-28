import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationItem } from "./notification-item";
import type { Notification } from "@/types";

const unread: Notification = {
  id: "notif_test_unread",
  type: "comment",
  title: "New Comment on Test Workspace",
  text: "Someone left a comment.",
  time: "5 mins ago",
  read: false,
};

const read: Notification = { ...unread, id: "notif_test_read", read: true };

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
