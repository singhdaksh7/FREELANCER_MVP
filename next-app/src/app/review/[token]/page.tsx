import type { Metadata } from "next";
import type { ComponentProps } from "react";
import { AlertOctagon, ShieldOff, Ban, FolderX } from "lucide-react";
import {
  authorizeReviewToken,
  recordReviewLinkView,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { getReviewableFiles } from "@/data-access/review-files";
import { getReviewCommentThreads } from "@/data-access/review-comments";
import { getActiveChangeRequest } from "@/data-access/change-requests";
import { getApprovalSummary } from "@/data-access/approvals";
import { getClientSupportTickets } from "@/data-access/support-tickets";
import { ReviewSystemState } from "@/components/review/review-system-state";
import { ReviewPortal } from "@/components/review/review-portal";

// Never statically rendered/cached — every request must re-authorize the
// token server-side. See CLIENT_REVIEW_ARCHITECTURE.md "Review access and
// privacy."
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  // The token itself is never interpolated into the title — only the
  // resolved workspace title (or a generic fallback on any failure).
  let title = "Secure Project Review";
  try {
    const context = await authorizeReviewToken(token);
    title = `${context.workspace.title} — Secure Review`;
  } catch {
    // Falls through to the generic title — never reveals *why* authorization failed here.
  }
  return {
    title,
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

type LoadResult =
  | { kind: "ready"; token: string; portalProps: Omit<ComponentProps<typeof ReviewPortal>, "token"> }
  | { kind: "no-files" }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | { kind: "error" };

/**
 * All data access + error handling happens here, outside any JSX — React's
 * lint rules (and the Next.js App Router's own guidance) call out
 * constructing JSX inside a try/catch as unsafe, since JSX construction
 * doesn't itself throw synchronously the way the surrounding catch expects.
 */
async function loadReviewPortal(token: string): Promise<LoadResult> {
  try {
    const context = await authorizeReviewToken(token);
    await recordReviewLinkView(context.reviewLinkId);

    const [files, comments, activeChangeRequest, approval, supportTickets] = await Promise.all([
      getReviewableFiles(context),
      getReviewCommentThreads(context.workspaceId),
      getActiveChangeRequest(context.workspaceId),
      getApprovalSummary(context.workspaceId),
      getClientSupportTickets(context),
    ]);

    if (files.length === 0) {
      return { kind: "no-files" };
    }

    return {
      kind: "ready",
      token,
      portalProps: {
        workspace: {
          title: context.workspace.title,
          amount: context.workspace.amount,
          currency: context.workspace.currency,
          creatorName: context.workspace.creatorName,
          client: context.workspace.client,
          deliveryMode: context.workspace.deliveryMode,
          status: context.workspace.status,
        },
        files,
        comments,
        supportTickets,
        activeChangeRequest,
        approval,
      },
    };
  } catch (error) {
    if (error instanceof ReviewLinkExpiredError) return { kind: "expired" };
    if (error instanceof ReviewLinkRevokedError) return { kind: "revoked" };
    if (error instanceof WorkspaceUnavailableError) return { kind: "unavailable" };
    if (error instanceof InvalidReviewTokenError) return { kind: "invalid" };
    console.error("Review portal failed to load:", error);
    return { kind: "error" };
  }
}

export default async function ReviewTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadReviewPortal(token);

  switch (result.kind) {
    case "ready":
      return <ReviewPortal token={result.token} {...result.portalProps} />;
    case "no-files":
      return (
        <ReviewSystemState
          code="NO_FILES"
          title="Nothing to Review Yet"
          message="This project doesn't have any files ready for review yet. Please check back soon."
          icon={FolderX}
        />
      );
    case "expired":
      return (
        <ReviewSystemState
          code="EXPIRED"
          title="Secure Link Expired"
          message="This review link has reached its expiration limit. Please ask the creator to send a new one."
          icon={AlertOctagon}
        />
      );
    case "revoked":
      return (
        <ReviewSystemState
          code="REVOKED"
          title="Secure Link Revoked"
          message="This review link has been revoked by the creator. Please ask for a new link."
          icon={Ban}
        />
      );
    case "unavailable":
      return (
        <ReviewSystemState
          code="UNAVAILABLE"
          title="Project Unavailable"
          message="This project is not currently available for review."
          icon={FolderX}
        />
      );
    case "invalid":
      return (
        <ReviewSystemState
          code="INVALID"
          title="Invalid Review Link"
          message="This review link isn't valid. Double-check the link, or ask the creator to resend it."
          icon={ShieldOff}
        />
      );
    default:
      return (
        <ReviewSystemState
          code="ERROR"
          title="Something Went Wrong"
          message="We couldn't load this review page. Please try again in a moment."
          icon={ShieldOff}
        />
      );
  }
}
