import "server-only";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser, requireAdminRole } from "./auth";
import { requireOwnedWorkspace } from "./authorization";
import { recordActivity } from "./activity";
import { ActivityAction } from "@/lib/activity-log";
import type { ReviewContext } from "./review-auth";
import type { CreateSupportTicketInput, ClientSupportTicketInput } from "@/validation/support-ticket";
import type { SupportTicketStatus } from "@/generated/prisma/enums";

export class SupportTicketNotFoundError extends Error {
  constructor(message = "This support ticket could not be found.") {
    super(message);
    this.name = "SupportTicketNotFoundError";
  }
}

function generateTicketNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TCK-${timestamp}${random}`;
}

/** Retries once on a ticketNumber collision (astronomically unlikely, but the unique constraint is real — never silently swallow a genuine collision). */
async function createTicketWithUniqueNumber<T>(create: (ticketNumber: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await create(generateTicketNumber());
    } catch (error) {
      if ((error as { code?: string }).code === "P2002" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique ticket number.");
}

export interface SupportTicketSummary {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  priority: string;
  subject: string;
  workspaceId: string | null;
  workspaceTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessageItem {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  description: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  resolvedAt: string | null;
  messages: SupportTicketMessageItem[];
}

function authorNameFor(message: {
  authorType: string;
  reviewerName: string | null;
  creatorAuthor: { name: string } | null;
  adminAuthor: { name: string } | null;
}): string {
  if (message.authorType === "CREATOR") return message.creatorAuthor?.name ?? "Creator";
  if (message.authorType === "ADMIN") return message.adminAuthor?.name ?? "Support";
  return message.reviewerName ?? "Reviewer";
}

/** Creator raises a ticket, optionally scoped to one of their own workspaces (ownership re-verified here, never trusted from the caller). */
export async function createCreatorSupportTicket(
  workspaceId: string | null,
  input: CreateSupportTicketInput,
): Promise<{ id: string; ticketNumber: string }> {
  const creator = await requireAuthenticatedUser();

  if (workspaceId) {
    await requireOwnedWorkspace(workspaceId);
  }

  return createTicketWithUniqueNumber(async (ticketNumber) => {
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          workspaceId,
          creatorId: creator.id,
          category: input.category,
          subject: input.subject,
          description: input.description,
          createdByType: "CREATOR",
          creatorAuthorId: creator.id,
        },
        select: { id: true, ticketNumber: true },
      });
      await recordActivity(tx, {
        action: ActivityAction.SUPPORT_TICKET_CREATED,
        actorType: "CREATOR",
        actorName: creator.name,
        creatorId: creator.id,
        workspaceId: workspaceId ?? undefined,
        metadata: { ticketNumber: created.ticketNumber, ticketCategory: input.category },
      });
      return created;
    });
    return ticket;
  });
}

/** Client raises a ticket through their token-authorized master review link — always scoped to that workspace, never a workspace the token doesn't belong to. */
export async function createClientSupportTicket(
  context: ReviewContext,
  input: ClientSupportTicketInput,
): Promise<{ id: string; ticketNumber: string }> {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: context.workspaceId }, select: { creatorId: true } });
  const reviewerName = (input.reviewerName ?? "").trim().slice(0, 120) || "Reviewer";

  return createTicketWithUniqueNumber(async (ticketNumber) => {
    return prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          workspaceId: context.workspaceId,
          creatorId: workspace.creatorId,
          reviewLinkId: context.reviewLinkId,
          category: input.category,
          subject: input.subject,
          description: input.description,
          createdByType: "CLIENT",
          reviewerName,
          reviewerEmail: input.reviewerEmail || null,
        },
        select: { id: true, ticketNumber: true },
      });
      await recordActivity(tx, {
        action: ActivityAction.SUPPORT_TICKET_CREATED,
        actorType: "CLIENT",
        actorName: reviewerName,
        creatorId: workspace.creatorId,
        workspaceId: context.workspaceId,
        metadata: { ticketNumber: created.ticketNumber, ticketCategory: input.category },
      });
      return created;
    });
  });
}

function mapSummary(row: {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  priority: string;
  subject: string;
  workspaceId: string | null;
  workspace: { title: string } | null;
  createdAt: Date;
  updatedAt: Date;
}): SupportTicketSummary {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    category: row.category,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    workspaceId: row.workspaceId,
    workspaceTitle: row.workspace?.title ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** All tickets raised by (or on a workspace of) the authenticated creator. */
export async function getOwnedSupportTickets(): Promise<SupportTicketSummary[]> {
  const creator = await requireAuthenticatedUser();
  const rows = await prisma.supportTicket.findMany({
    where: { creatorId: creator.id },
    include: { workspace: { select: { title: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(mapSummary);
}

async function loadDetail(ticket: {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  priority: string;
  subject: string;
  description: string;
  workspaceId: string | null;
  workspace: { title: string } | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}): Promise<SupportTicketDetail> {
  const messages = await prisma.supportTicketMessage.findMany({
    where: { ticketId: ticket.id },
    include: { creatorAuthor: { select: { name: true } }, adminAuthor: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return {
    ...mapSummary(ticket),
    description: ticket.description,
    reviewerName: ticket.reviewerName,
    reviewerEmail: ticket.reviewerEmail,
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    messages: messages.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorName: authorNameFor(m),
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function getOwnedSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  const creator = await requireAuthenticatedUser();
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, creatorId: creator.id },
    include: { workspace: { select: { title: true } } },
  });
  if (!ticket) throw new SupportTicketNotFoundError();
  return loadDetail(ticket);
}

/** Creator reply on their own ticket. */
export async function addCreatorSupportMessage(ticketId: string, body: string): Promise<void> {
  const creator = await requireAuthenticatedUser();
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, creatorId: creator.id } });
  if (!ticket) throw new SupportTicketNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.supportTicketMessage.create({
      data: { ticketId, authorType: "CREATOR", creatorAuthorId: creator.id, body },
    });
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status: "WAITING_FOR_CLIENT" } });
    await recordActivity(tx, {
      action: ActivityAction.SUPPORT_TICKET_REPLIED,
      actorType: "CREATOR",
      actorName: creator.name,
      creatorId: creator.id,
      workspaceId: ticket.workspaceId ?? undefined,
      metadata: { ticketNumber: ticket.ticketNumber },
    });
  });
}

/**
 * Tickets a client can see through their token-authorized master review
 * link — strictly scoped to this workspace; a client can never browse the
 * creator's other tickets, from other workspaces or otherwise.
 */
export async function getClientSupportTickets(context: ReviewContext): Promise<SupportTicketSummary[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { workspaceId: context.workspaceId },
    include: { workspace: { select: { title: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(mapSummary);
}

export async function getClientSupportTicket(context: ReviewContext, ticketId: string): Promise<SupportTicketDetail> {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, workspaceId: context.workspaceId },
    include: { workspace: { select: { title: true } } },
  });
  if (!ticket) throw new SupportTicketNotFoundError();
  return loadDetail(ticket);
}

export async function addClientSupportMessage(context: ReviewContext, ticketId: string, body: string, reviewerName?: string): Promise<void> {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, workspaceId: context.workspaceId } });
  if (!ticket) throw new SupportTicketNotFoundError();
  const name = (reviewerName ?? "").trim().slice(0, 120) || "Reviewer";

  await prisma.$transaction(async (tx) => {
    await tx.supportTicketMessage.create({
      data: { ticketId, authorType: "CLIENT", reviewerName: name, body },
    });
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status: "WAITING_FOR_CREATOR" } });
    await recordActivity(tx, {
      action: ActivityAction.SUPPORT_TICKET_REPLIED,
      actorType: "CLIENT",
      actorName: name,
      creatorId: ticket.creatorId ?? undefined,
      workspaceId: ticket.workspaceId ?? undefined,
      metadata: { ticketNumber: ticket.ticketNumber },
    });
  });
}

// ---- Admin ----

export async function getAdminSupportTickets(page: number, pageSize = 25): Promise<{ rows: SupportTicketSummary[]; total: number }> {
  await requireAdminRole();
  const skip = Math.max(0, (page - 1) * pageSize);
  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      include: { workspace: { select: { title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.supportTicket.count(),
  ]);
  return { rows: rows.map(mapSummary), total };
}

export async function getAdminSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  await requireAdminRole();
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { workspace: { select: { title: true } } },
  });
  if (!ticket) throw new SupportTicketNotFoundError();
  return loadDetail(ticket);
}

/**
 * Admin reply — read-only elsewhere in the app (see ADMIN_ARCHITECTURE.md
 * "Admin must not..."): this and updateSupportTicketStatus are the ONLY
 * writes an admin can make anywhere in the system. Neither touches
 * Payment/DownloadGrant/ReviewComment/WorkspaceApproval in any way.
 */
export async function addAdminSupportMessage(ticketId: string, body: string): Promise<void> {
  const admin = await requireAdminRole();
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SupportTicketNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.supportTicketMessage.create({
      data: { ticketId, authorType: "ADMIN", adminAuthorId: admin.id, body },
    });
    await recordActivity(tx, {
      action: ActivityAction.SUPPORT_TICKET_REPLIED,
      actorType: "ADMIN",
      actorName: admin.name,
      creatorId: ticket.creatorId ?? undefined,
      workspaceId: ticket.workspaceId ?? undefined,
      metadata: { ticketNumber: ticket.ticketNumber },
    });
  });
}

export async function updateSupportTicketStatus(ticketId: string, status: SupportTicketStatus): Promise<void> {
  const admin = await requireAdminRole();
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SupportTicketNotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: { status, resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : ticket.resolvedAt },
    });
    await recordActivity(tx, {
      action: status === "RESOLVED" ? ActivityAction.SUPPORT_TICKET_RESOLVED : ActivityAction.SUPPORT_TICKET_STATUS_CHANGED,
      actorType: "ADMIN",
      actorName: admin.name,
      creatorId: ticket.creatorId ?? undefined,
      workspaceId: ticket.workspaceId ?? undefined,
      metadata: { ticketNumber: ticket.ticketNumber, ticketStatus: status },
    });
  });
}
