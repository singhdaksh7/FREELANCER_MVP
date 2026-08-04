import { NextRequest, NextResponse } from "next/server";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { claimDownloadSession } from "@/data-access/downloads";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Client-facing "Download Approved Files" action — the only path by which
 * a client's review portal ever reaches `/download/[token]` (see
 * `claimDownloadSession`'s doc comment). Works identically for both
 * delivery modes: `claimDownloadSession` resolves the workspace's
 * DownloadGrant by `workspaceId`, not by Payment, so an APPROVAL_ONLY
 * grant (which has no Payment row at all) is claimed exactly the same way
 * a PAYMENT_REQUIRED one is. Returns 409 while the workspace hasn't
 * reached FILES_UNLOCKED/DELIVERED yet, or no grant exists — the client UI
 * only ever calls this once it already knows (via the payment/delivery
 * status poll) that a download should be ready.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    await checkRateLimit({ bucket: "download-session-claim", identifier: token, max: 20, windowSeconds: 60 });
    const context = await authorizeReviewToken(token);
    const downloadPath = await claimDownloadSession(context);
    return NextResponse.json({ downloadPath }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidReviewTokenError: { status: 404, message: new InvalidReviewTokenError().message },
      ReviewLinkExpiredError: { status: 404, message: new ReviewLinkExpiredError().message },
      ReviewLinkRevokedError: { status: 404, message: new ReviewLinkRevokedError().message },
      WorkspaceUnavailableError: { status: 404, message: new WorkspaceUnavailableError().message },
      DownloadNotReadyError: { status: 409 },
      RateLimitExceededError: { status: 429, message: new RateLimitExceededError().message },
    });
  }
}
