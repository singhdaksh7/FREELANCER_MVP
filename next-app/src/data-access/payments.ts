import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "./auth";
import { sumDecimals, toDecimal, toDisplayNumber } from "@/lib/decimal";
import { parseEnumParam, type RawSearchParams } from "@/lib/search-params";
import { demoDaysAgo } from "@/lib/demo-clock";
import { PaymentStatus, type Prisma } from "@/generated/prisma/client";

export interface PaymentListItem {
  id: string;
  workspaceId: string;
  workspaceTitle: string;
  clientName: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentSummary {
  totalReceived: number;
  outstandingAmount: number;
}

const STATUS_FILTER_VALUES = ["All", ...Object.values(PaymentStatus)] as const;
const DATE_RANGE_VALUES = ["all", "7", "30"] as const;
export type PaymentDateRange = (typeof DATE_RANGE_VALUES)[number];

export interface PaymentFilters {
  status: (typeof STATUS_FILTER_VALUES)[number];
  dateRange: PaymentDateRange;
}

export interface PaymentsResult {
  payments: PaymentListItem[];
  summary: PaymentSummary;
  filters: PaymentFilters;
  /** True if the creator has any payments at all, independent of the current filters. */
  hasAnyPayments: boolean;
}

type PaymentWithWorkspace = Prisma.PaymentGetPayload<{
  include: { workspace: { select: { title: true; clientName: true } } };
}>;

function mapPayment(payment: PaymentWithWorkspace): PaymentListItem {
  return {
    id: payment.id,
    workspaceId: payment.workspaceId,
    workspaceTitle: payment.workspace.title,
    clientName: payment.workspace.clientName,
    amount: toDisplayNumber(payment.amount),
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    createdAt: payment.createdAt.toISOString(),
  };
}

/** Database-backed status + date-range filtering over the authenticated creator's payments. */
export async function getPayments(rawParams: RawSearchParams): Promise<PaymentsResult> {
  const creator = await requireAuthenticatedUser();

  const status = parseEnumParam(rawParams, "status", STATUS_FILTER_VALUES, "All");
  const dateRange = parseEnumParam(rawParams, "date", DATE_RANGE_VALUES, "all");

  const where: Prisma.PaymentWhereInput = {
    workspace: { creatorId: creator.id },
    ...(status !== "All" ? { status } : {}),
    ...(dateRange !== "all"
      ? { createdAt: { gte: new Date(`${demoDaysAgo(Number(dateRange))}T00:00:00Z`) } }
      : {}),
  };

  const [payments, allPayments] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: { workspace: { select: { title: true, clientName: true } } },
    }),
    // Summary cards always reflect the creator's full payment history,
    // independent of the currently applied filters (matches Phase 2 behavior).
    prisma.payment.findMany({
      where: { workspace: { creatorId: creator.id } },
      select: { amount: true, status: true },
    }),
  ]);

  const settled = allPayments.filter((p) => p.status === "PAID");
  const pending = allPayments.filter((p) => p.status !== "PAID");

  const summary: PaymentSummary = {
    // No platform fee is ever deducted (see PLATFORM_FEE_AND_PAYOUT_LEDGER.md) —
    // total received is simply the sum of captured gross amounts.
    totalReceived: toDisplayNumber(sumDecimals(settled.map((p) => toDecimal(p.amount)))),
    outstandingAmount: toDisplayNumber(sumDecimals(pending.map((p) => p.amount))),
  };

  return {
    payments: payments.map(mapPayment),
    summary,
    filters: { status, dateRange },
    hasAnyPayments: allPayments.length > 0,
  };
}
