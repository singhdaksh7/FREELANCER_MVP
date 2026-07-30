import { NextRequest, NextResponse } from "next/server";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { getClientPaymentStatus } from "@/data-access/payment-orders";
import { reconcilePaymentStatus } from "@/data-access/payment-reconciliation";
import { RateLimitExceededError } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Client-triggered reconciliation fallback — used by the "Confirming
 * settlement…" screen when the webhook hasn't landed within a few
 * seconds. Rate-limited per Payment id (see
 * src/data-access/payment-reconciliation.ts) so this can never be used to
 * hammer the gateway. Never accepts an amount/status from the caller —
 * the gateway's own response is the only source of truth.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const context = await authorizeReviewToken(token);
    const current = await getClientPaymentStatus(context);
    if (!current.paymentId) {
      return NextResponse.json({ status: current.workspaceStatus }, { status: 200 });
    }
    const result = await reconcilePaymentStatus(current.paymentId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidReviewTokenError: { status: 404, message: new InvalidReviewTokenError().message },
      ReviewLinkExpiredError: { status: 404, message: new ReviewLinkExpiredError().message },
      ReviewLinkRevokedError: { status: 404, message: new ReviewLinkRevokedError().message },
      WorkspaceUnavailableError: { status: 404, message: new WorkspaceUnavailableError().message },
      RateLimitExceededError: { status: 429, message: new RateLimitExceededError().message },
    });
  }
}
