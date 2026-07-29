import { NextRequest, NextResponse } from "next/server";
import {
  authorizeDownloadGrant,
  InvalidDownloadTokenError,
  DownloadGrantExpiredError,
  DownloadGrantRevokedError,
  DownloadGrantExhaustedError,
} from "@/data-access/download-auth";
import { downloadOriginalFile, FileNotInGrantError } from "@/data-access/downloads";
import { checkRateLimit, RateLimitExceededError, getClientIp } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Individual approved-original download — see
 * SECURE_DOWNLOAD_ARCHITECTURE.md "Original authorization." A review
 * token can never reach this route (entirely different token space —
 * authorizeDownloadGrant only ever looks up DownloadGrant.tokenHash).
 * Redirects to a 60-second presigned S3 GET URL; never streams or
 * exposes the raw storage key itself.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;

  try {
    await checkRateLimit({ bucket: "download-original-request", identifier: token, max: 60, windowSeconds: 60 });
    const context = await authorizeDownloadGrant(token);
    const result = await downloadOriginalFile(context, fileId, {
      userAgent: request.headers.get("user-agent"),
      ip: getClientIp(request),
    });
    return NextResponse.redirect(result.url, { status: 302 });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidDownloadTokenError: { status: 404, message: new InvalidDownloadTokenError().message },
      DownloadGrantExpiredError: { status: 410, message: new DownloadGrantExpiredError().message },
      DownloadGrantRevokedError: { status: 410, message: new DownloadGrantRevokedError().message },
      DownloadGrantExhaustedError: { status: 429, message: new DownloadGrantExhaustedError().message },
      FileNotInGrantError: { status: 404, message: new FileNotInGrantError().message },
      RateLimitExceededError: { status: 429, message: new RateLimitExceededError().message },
    });
  }
}
