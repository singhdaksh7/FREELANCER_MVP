import "server-only";
import { prisma } from "@/lib/prisma";
import { hashReviewToken, isValidReviewTokenShape } from "@/lib/review-token";

/**
 * Token-authorized client-review access — a completely separate trust path
 * from `src/data-access/auth.ts`'s creator sessions. Possession of a valid,
 * unexpired, non-revoked token identifies "a reviewer with access to this
 * link," never a cryptographically verified individual — see
 * REVIEW_TOKEN_SECURITY.md. Never reuses `requireAuthenticatedUser()` and
 * is never wired into `src/proxy.ts`'s protected-route matcher.
 */

export class InvalidReviewTokenError extends Error {
  constructor(message = "This review link is not valid.") {
    super(message);
    this.name = "InvalidReviewTokenError";
  }
}

export class ReviewLinkExpiredError extends Error {
  constructor(message = "This review link has expired.") {
    super(message);
    this.name = "ReviewLinkExpiredError";
  }
}

export class ReviewLinkRevokedError extends Error {
  constructor(message = "This review link has been revoked.") {
    super(message);
    this.name = "ReviewLinkRevokedError";
  }
}

export class WorkspaceUnavailableError extends Error {
  constructor(message = "This project is not currently available for review.") {
    super(message);
    this.name = "WorkspaceUnavailableError";
  }
}

export interface ReviewContext {
  reviewLinkId: string;
  workspaceId: string;
  workspace: {
    id: string;
    title: string;
    description: string | null;
    amount: number;
    currency: string;
    status: string;
    watermarkText: string | null;
    /** Approved business-facing identity only — never email/internal ids. */
    creatorName: string;
    client: { name: string };
  };
}

/**
 * Validates a raw token and returns only workspace-scoped review context —
 * never general creator access, never a User row, never the raw token
 * itself (which is not persisted anywhere to look up in the first place).
 * Shape is checked before any database access. Distinct error types let
 * callers render the exact matching system-state screen without leaking
 * *why* internally (no Prisma/token detail ever reaches the response).
 */
export async function authorizeReviewToken(rawToken: string): Promise<ReviewContext> {
  if (!isValidReviewTokenShape(rawToken)) {
    throw new InvalidReviewTokenError();
  }

  const tokenHash = hashReviewToken(rawToken);

  const link = await prisma.reviewLink.findUnique({
    where: { tokenHash },
    include: {
      workspace: {
        include: {
          client: { select: { name: true } },
          creator: { select: { name: true } },
        },
      },
    },
  });

  if (!link) {
    throw new InvalidReviewTokenError();
  }
  if (link.status === "REVOKED") {
    throw new ReviewLinkRevokedError();
  }
  if (link.status === "EXPIRED" || link.expiresAt <= new Date()) {
    throw new ReviewLinkExpiredError();
  }
  if (link.workspace.status === "CANCELLED") {
    throw new WorkspaceUnavailableError();
  }

  return {
    reviewLinkId: link.id,
    workspaceId: link.workspace.id,
    workspace: {
      id: link.workspace.id,
      title: link.workspace.title,
      description: link.workspace.description,
      amount: Number(link.workspace.amount),
      currency: link.workspace.currency,
      status: link.workspace.status,
      watermarkText: link.workspace.watermarkText,
      creatorName: link.workspace.creator.name,
      client: { name: link.workspace.client.name },
    },
  };
}

/**
 * Best-effort view counter, updated once per review-portal page load.
 * Deliberately NOT paired with an ActivityLog row (would be extremely
 * noisy on every refresh) — see CLIENT_REVIEW_ARCHITECTURE.md.
 */
export async function recordReviewLinkView(reviewLinkId: string): Promise<void> {
  try {
    await prisma.reviewLink.update({
      where: { id: reviewLinkId },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  } catch {
    // Best-effort — a failed view-count update must never break page access.
  }
}
