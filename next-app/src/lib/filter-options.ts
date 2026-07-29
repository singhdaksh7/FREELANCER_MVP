/**
 * Client-safe filter option lists for the workspace/payment filter bars.
 * Deliberately imports enum values from the slim, browser-safe
 * `@/generated/prisma/enums` entrypoint — never `.../client`, which pulls
 * in the full Prisma Client (Node-only) module graph.
 */
import { WorkspaceStatus, PaymentStatus, DeliveryMode } from "@/generated/prisma/enums";
import { workspaceStatusLabel, paymentStatusLabel, deliveryModeLabel } from "./status-labels";

export interface FilterOption {
  label: string;
  value: string;
}

export const WORKSPACE_STATUS_OPTIONS: FilterOption[] = [
  { label: "All Statuses", value: "All" },
  ...Object.values(WorkspaceStatus).map((value) => ({
    label: workspaceStatusLabel(value),
    value,
  })),
];

export const PAYMENT_STATUS_OPTIONS: FilterOption[] = [
  { label: "All Statuses", value: "All" },
  ...Object.values(PaymentStatus).map((value) => ({
    label: paymentStatusLabel(value),
    value,
  })),
];

export const DELIVERY_MODE_OPTIONS: FilterOption[] = [
  { label: "All Delivery Modes", value: "All" },
  ...Object.values(DeliveryMode).map((value) => ({
    label: deliveryModeLabel(value),
    value,
  })),
];

export const PAYMENT_DATE_RANGE_OPTIONS: FilterOption[] = [
  { label: "All Time", value: "all" },
  { label: "Last 7 Days", value: "7" },
  { label: "Last 30 Days", value: "30" },
];

export const WORKSPACE_SORT_OPTIONS: FilterOption[] = [
  { label: "Recently Updated", value: "recent" },
  { label: "Title A–Z", value: "title" },
  { label: "Amount: High to Low", value: "amount" },
];
