import type { Workspace } from "@/types";
import { CLIENTS } from "./clients";

/**
 * Ported from the original Vite INITIAL_WORKSPACES mock (src/data/mockData.js).
 * A fourth workspace ("Social Media Campaign", for Ananya Kapoor) was added
 * to satisfy this phase's explicit demo-content list and give the Clients
 * page/status filters more realistic variety — see MIGRATION_STATUS.md.
 */
export const WORKSPACES: Workspace[] = [
  {
    id: "ws_brand_identity",
    title: "Brand Identity Design",
    secureToken: "sec_tok_brand_identity_99",
    client: { id: CLIENTS[0].id, name: CLIENTS[0].name, company: CLIENTS[0].company },
    category: "Branding & Graphics",
    description:
      "Complete brand guidelines, logotype variations, color palette system, and social media assets.",
    amount: 25000,
    status: "In Review",
    createdAt: "2026-07-20",
    updatedAt: "2026-07-28",
    watermarkText: "PREVIEW - PROPERTY OF ARJUN RAJ",
    currentVersion: "v2",
    versions: ["v1", "v2"],
    files: [
      {
        id: "file_1",
        name: "Brand_Guidelines_V2.pdf",
        size: "18.4 MB",
        type: "application/pdf",
        previewUrl:
          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000",
        isLocked: true,
      },
      {
        id: "file_2",
        name: "Primary_Logo_Package.zip",
        size: "42.1 MB",
        type: "application/zip",
        previewUrl:
          "https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&q=80&w=1000",
        isLocked: true,
      },
    ],
    comments: [
      {
        id: "c_1",
        author: "Rohit Sharma",
        role: "Client",
        avatarUrl:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=128",
        timestamp: "2 hours ago",
        text: "Could we adjust the primary blue hex to match our legacy brand color #1D4ED8 on slide 4?",
        fileId: "file_1",
        version: "v1",
        status: "Resolved",
        replies: [
          {
            id: "c_1_r1",
            author: "Arjun Raj",
            role: "Creator",
            avatarUrl:
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=128",
            timestamp: "1 hour ago",
            text: "Updated in V2! Please take a look at the revised guidelines file.",
          },
        ],
      },
      {
        id: "c_2",
        author: "Rohit Sharma",
        role: "Client",
        avatarUrl:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=128",
        timestamp: "30 mins ago",
        text: "The new logo variation in V2 looks stunning! Ready to approve once final payment is processed.",
        fileId: "file_1",
        version: "v2",
        status: "Open",
        replies: [],
      },
    ],
    activityLog: [
      { id: "act_1", action: "Workspace Created", user: "Arjun Raj", timestamp: "2026-07-20 10:30 AM" },
      { id: "act_2", action: "Payment Gated Link Generated (₹25,000)", user: "Arjun Raj", timestamp: "2026-07-20 10:35 AM" },
      { id: "act_3", action: "Client Opened Review Link", user: "Rohit Sharma", timestamp: "2026-07-21 02:15 PM" },
      { id: "act_4", action: "Changes Requested (V1)", user: "Rohit Sharma", timestamp: "2026-07-22 11:00 AM" },
      { id: "act_5", action: "Uploaded Version 2 Files", user: "Arjun Raj", timestamp: "2026-07-28 08:30 AM" },
    ],
  },
  {
    id: "ws_ecommerce_ui",
    title: "E-commerce Website UI",
    secureToken: "sec_tok_ecommerce_88",
    client: { id: CLIENTS[1].id, name: CLIENTS[1].name, company: CLIENTS[1].company },
    category: "Web Design",
    description:
      "High-fidelity Figma wireframes and mobile responsive design system for online apparel store.",
    amount: 45000,
    status: "Approved",
    createdAt: "2026-07-15",
    updatedAt: "2026-07-27",
    watermarkText: "PREVIEW - FASHIONCRAFT UI",
    currentVersion: "v1",
    versions: ["v1"],
    files: [
      {
        id: "file_e1",
        name: "Storefront_HighFi_UI.fig",
        size: "35.2 MB",
        type: "application/figma",
        previewUrl:
          "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1000",
        isLocked: true,
      },
    ],
    comments: [],
    activityLog: [
      { id: "act_e1", action: "Workspace Created", user: "Arjun Raj", timestamp: "2026-07-15 09:00 AM" },
      { id: "act_e2", action: "Client Approved Work", user: "Priya Verma", timestamp: "2026-07-27 04:20 PM" },
    ],
  },
  {
    id: "ws_product_pkg",
    title: "Product Packaging Design",
    secureToken: "sec_tok_packaging_77",
    client: { id: CLIENTS[2].id, name: CLIENTS[2].name, company: CLIENTS[2].company },
    category: "Packaging",
    description:
      "3D Render mockups and print-ready die-cut vector files for organic coffee box.",
    amount: 30000,
    status: "Paid",
    createdAt: "2026-07-02",
    updatedAt: "2026-07-18",
    watermarkText: "UNLOCKED ORIGINAL",
    currentVersion: "v1",
    versions: ["v1"],
    files: [
      {
        id: "file_p1",
        name: "CoffeeBox_PrintReady_DieCut.ai",
        size: "64.0 MB",
        type: "application/illustrator",
        previewUrl:
          "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=1000",
        isLocked: false,
      },
    ],
    comments: [],
    activityLog: [
      { id: "act_p1", action: "Workspace Created", user: "Arjun Raj", timestamp: "2026-07-02 02:00 PM" },
      { id: "act_p2", action: "Payment Received (₹30,000)", user: "Razorpay System", timestamp: "2026-07-18 03:45 PM" },
      { id: "act_p3", action: "Files Unlocked for Download", user: "System", timestamp: "2026-07-18 03:45 PM" },
    ],
  },
  {
    id: "ws_social_campaign",
    title: "Social Media Campaign",
    secureToken: "sec_tok_social_campaign_66",
    client: { id: CLIENTS[3].id, name: CLIENTS[3].name, company: CLIENTS[3].company },
    category: "Social Media & Marketing",
    description:
      "Platform-ready social templates, reel cover set, and campaign content calendar for Luxe Living's festive launch.",
    amount: 18000,
    status: "Draft",
    createdAt: "2026-07-25",
    updatedAt: "2026-07-26",
    watermarkText: "PREVIEW - LUXE LIVING CAMPAIGN",
    currentVersion: "v1",
    versions: ["v1"],
    files: [
      {
        id: "file_s1",
        name: "Campaign_Templates_Pack.zip",
        size: "12.6 MB",
        type: "application/zip",
        previewUrl:
          "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&q=80&w=1000",
        isLocked: true,
      },
    ],
    comments: [],
    activityLog: [
      { id: "act_s1", action: "Workspace Created", user: "Arjun Raj", timestamp: "2026-07-25 11:00 AM" },
      { id: "act_s2", action: "Preview Watermarking Queued", user: "System", timestamp: "2026-07-26 09:15 AM" },
    ],
  },
];
