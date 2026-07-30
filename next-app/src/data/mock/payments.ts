import type { Payment } from "@/types";

/** Ported from the original Vite MOCK_PAYMENTS mock (src/data/mockData.js). */
export const PAYMENTS: Payment[] = [
  {
    id: "pay_101",
    workspaceId: "ws_product_pkg",
    workspaceTitle: "Product Packaging Design",
    clientName: "Karan Mehta",
    amount: 30000,
    fee: 750,
    netAmount: 29250,
    date: "2026-07-18",
    status: "Completed",
    paymentMethod: "UPI (GPay)",
  },
  {
    id: "pay_102",
    workspaceId: "ws_ecommerce_ui",
    workspaceTitle: "E-commerce Website UI",
    clientName: "Priya Verma",
    amount: 45000,
    fee: 1125,
    netAmount: 43875,
    date: null,
    status: "Pending Approval",
    paymentMethod: "Card / NetBanking",
  },
  {
    id: "pay_103",
    workspaceId: "ws_brand_identity",
    workspaceTitle: "Brand Identity Design",
    clientName: "Rohit Sharma",
    amount: 25000,
    fee: 625,
    netAmount: 24375,
    date: null,
    status: "In Review",
    paymentMethod: "UPI / Card",
  },
];
