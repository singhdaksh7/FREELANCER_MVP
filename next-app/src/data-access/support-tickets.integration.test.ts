import { describe, expect, it, vi, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateReviewToken, hashReviewToken, reviewTokenPrefix } from "@/lib/review-token";

/**
 * Integration tests (real database) for the support-ticket workflow — see
 * SUPPORT_AND_DISPUTE_ARCHITECTURE.md. Covers the cross-workspace
 * isolation guarantee explicitly called out in REQUIREMENTS_ALIGNMENT.md:
 * a client reaching a ticket through their master review link can never
 * see or reach a ticket from a different workspace, even one belonging to
 * the same creator.
 */

const ARJUN_ID = "usr_arjun";

const { requireAuthenticatedUserMock } = vi.hoisted(() => ({ requireAuthenticatedUserMock: vi.fn() }));
// A full replacement (not a partial spread over the real module) — the
// real requireAdminRole/requireCreatorRole call their *own* module-local
// requireAuthenticatedUser binding internally, which a partial mock can't
// intercept (classic ESM self-reference limitation), so both must be
// reimplemented here to route through the same mock function.
vi.mock("@/data-access/auth", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
  requireAdminRole: async () => {
    const user = await requireAuthenticatedUserMock();
    if (user.role !== "ADMIN") throw new Error("Not an admin — test double refused.");
    return user;
  },
}));

function signInAsArjun() {
  requireAuthenticatedUserMock.mockResolvedValue({ id: ARJUN_ID, name: "Arjun Raj", email: "arjun@example.com", role: "CREATOR", image: null });
}

const createdWorkspaceIds: string[] = [];
const createdClientIds: string[] = [];
const createdTicketIds: string[] = [];

afterAll(async () => {
  await prisma.supportTicketMessage.deleteMany({ where: { ticket: { id: { in: createdTicketIds } } } });
  await prisma.supportTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
  await prisma.reviewLink.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
  await prisma.$disconnect();
});

async function createReviewableWorkspace(title: string) {
  const client = await prisma.client.create({
    data: { creatorId: ARJUN_ID, name: "Test Client", email: `client-${Date.now()}-${Math.random()}@example.com` },
  });
  createdClientIds.push(client.id);

  const workspace = await prisma.workspace.create({
    data: { creatorId: ARJUN_ID, clientId: client.id, title, currency: "INR", amount: null, deliveryMode: "PREVIEW_ONLY", status: "IN_REVIEW" },
  });
  createdWorkspaceIds.push(workspace.id);

  const rawToken = generateReviewToken();
  const reviewLink = await prisma.reviewLink.create({
    data: {
      workspaceId: workspace.id,
      tokenHash: hashReviewToken(rawToken),
      tokenPrefix: reviewTokenPrefix(rawToken),
      expiresAt: null,
      createdById: ARJUN_ID,
    },
  });

  return { workspace, reviewLink, reviewToken: rawToken };
}

describe("support tickets — cross-workspace isolation", () => {
  it("a client cannot see or reach a support ticket raised on a different workspace of the same creator", async () => {
    const workspaceA = await createReviewableWorkspace("IT Support Ticket Workspace A");
    const workspaceB = await createReviewableWorkspace("IT Support Ticket Workspace B");

    const { authorizeReviewToken } = await import("./review-auth");
    const { createClientSupportTicket, getClientSupportTickets, getClientSupportTicket, SupportTicketNotFoundError } = await import(
      "./support-tickets"
    );

    const contextA = await authorizeReviewToken(workspaceA.reviewToken);
    const { id: ticketAId } = await createClientSupportTicket(contextA, {
      category: "DELIVERY",
      subject: "Where are my files?",
      description: "I have not received anything yet.",
      reviewerName: "Rohit",
    });
    createdTicketIds.push(ticketAId);

    const contextB = await authorizeReviewToken(workspaceB.reviewToken);
    const ticketsVisibleFromB = await getClientSupportTickets(contextB);
    expect(ticketsVisibleFromB.map((t) => t.id)).not.toContain(ticketAId);

    await expect(getClientSupportTicket(contextB, ticketAId)).rejects.toBeInstanceOf(SupportTicketNotFoundError);

    // But it IS visible from its own workspace's context.
    const ticketsVisibleFromA = await getClientSupportTickets(contextA);
    expect(ticketsVisibleFromA.map((t) => t.id)).toContain(ticketAId);
  });

  it("creator sees the ticket, and an admin can reply + change status — with no path to touch payment/delivery/workspace state", async () => {
    signInAsArjun();
    const workspace = await createReviewableWorkspace("IT Admin Review Workspace");
    const { authorizeReviewToken } = await import("./review-auth");
    const { createClientSupportTicket, addAdminSupportMessage, updateSupportTicketStatus, getOwnedSupportTickets, getAdminSupportTicket } =
      await import("./support-tickets");

    const context = await authorizeReviewToken(workspace.reviewToken);
    const { id: ticketId } = await createClientSupportTicket(context, {
      category: "QUALITY_DISPUTE",
      subject: "Not what I expected",
      description: "The colors are off.",
      reviewerName: "Rohit",
    });
    createdTicketIds.push(ticketId);

    const ownedTickets = await getOwnedSupportTickets();
    expect(ownedTickets.map((t) => t.id)).toContain(ticketId);

    // Switch the mocked session to an ADMIN role for the admin-side calls.
    // Uses the real seeded admin account (prisma/seed.ts) — adminAuthorId is a real FK to User.
    requireAuthenticatedUserMock.mockResolvedValue({ id: "usr_admin", name: "Priya Admin", email: "admin@example.com", role: "ADMIN", image: null });

    await addAdminSupportMessage(ticketId, "We're looking into this.");
    await updateSupportTicketStatus(ticketId, "UNDER_REVIEW");

    const detail = await getAdminSupportTicket(ticketId);
    expect(detail.status).toBe("UNDER_REVIEW");
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0]!.authorType).toBe("ADMIN");

    // The workspace itself — status, deliveryMode, everything — is untouched.
    const stillWorkspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.workspace.id } });
    expect(stillWorkspace.status).toBe("IN_REVIEW");
    expect(stillWorkspace.deliveryMode).toBe("PREVIEW_ONLY");
  });
});
