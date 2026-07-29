import { NextRequest, NextResponse } from "next/server";
import {
  authorizeReviewToken,
  InvalidReviewTokenError,
  ReviewLinkExpiredError,
  ReviewLinkRevokedError,
  WorkspaceUnavailableError,
} from "@/data-access/review-auth";
import { getClientPaymentStatus } from "@/data-access/payment-orders";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Read-only, database-only payment/workspace status poll — the client UI
 * polls THIS endpoint (never Razorpay directly, never localStorage) while
 * waiting for a webhook to land. See PAYMENT_ARCHITECTURE.md "Reconciliation."
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const context = await authorizeReviewToken(token);
    const status = await getClientPaymentStatus(context);
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidReviewTokenError: { status: 404, message: new InvalidReviewTokenError().message },
      ReviewLinkExpiredError: { status: 404, message: new ReviewLinkExpiredError().message },
      ReviewLinkRevokedError: { status: 404, message: new ReviewLinkRevokedError().message },
      WorkspaceUnavailableError: { status: 404, message: new WorkspaceUnavailableError().message },
    });
  }
}
