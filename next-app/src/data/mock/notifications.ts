import type { Notification } from "@/types";

/**
 * Extends the original Vite MOCK_NOTIFICATIONS mock (src/data/mockData.js,
 * which only had "comment" / "approval" / "payment" / "view" entries) with
 * "changes_requested", "download" and "preview_failed" examples, matching
 * the notification types called out explicitly for this phase.
 */
export const NOTIFICATIONS: Notification[] = [
  {
    id: "notif_1",
    type: "comment",
    title: "New Comment on Brand Identity Design",
    text: "Rohit Sharma commented on slide 4.",
    time: "30 mins ago",
    read: false,
    workspaceId: "ws_brand_identity",
    clientName: "Rohit Sharma",
  },
  {
    id: "notif_2",
    type: "approval",
    title: "Work Approved by Priya Verma",
    text: "E-commerce Website UI was approved. Payment pending.",
    time: "1 day ago",
    read: false,
    workspaceId: "ws_ecommerce_ui",
    clientName: "Priya Verma",
  },
  {
    id: "notif_3",
    type: "payment",
    title: "Payment Received ₹30,000",
    text: "Payment for Product Packaging Design has succeeded.",
    time: "10 days ago",
    read: true,
    workspaceId: "ws_product_pkg",
    clientName: "Karan Mehta",
  },
  {
    id: "notif_4",
    type: "view",
    title: "Client Viewed Secure Link",
    text: "Rohit Sharma opened sec_tok_brand_identity_99",
    time: "1 week ago",
    read: true,
    workspaceId: "ws_brand_identity",
    clientName: "Rohit Sharma",
  },
  {
    id: "notif_5",
    type: "changes_requested",
    title: "Changes Requested on Brand Identity Design",
    text: "Rohit Sharma requested revisions on the V1 guidelines.",
    time: "2 days ago",
    read: true,
    workspaceId: "ws_brand_identity",
    clientName: "Rohit Sharma",
  },
  {
    id: "notif_6",
    type: "download",
    title: "Files Downloaded by Karan Mehta",
    text: "Original Product Packaging Design files were downloaded.",
    time: "9 days ago",
    read: true,
    workspaceId: "ws_product_pkg",
    clientName: "Karan Mehta",
  },
  {
    id: "notif_7",
    type: "preview_failed",
    title: "Preview Processing Failed",
    text: "Watermark preview generation failed for Social Media Campaign — retry required.",
    time: "1 hour ago",
    read: false,
    workspaceId: "ws_social_campaign",
    clientName: "Ananya Kapoor",
  },
];
