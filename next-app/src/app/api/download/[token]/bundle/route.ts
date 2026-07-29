import { NextRequest, NextResponse } from "next/server";
import {
  authorizeDownloadGrant,
  InvalidDownloadTokenError,
  DownloadGrantExpiredError,
  DownloadGrantRevokedError,
  DownloadGrantExhaustedError,
} from "@/data-access/download-auth";
import { downloadBundle, BundleNotReadyError } from "@/data-access/downloads";
import { checkRateLimit, RateLimitExceededError, getClientIp } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * Full delivery-bundle ZIP download — see
 * SECURE_DOWNLOAD_ARCHITECTURE.md. Never issues a URL while the bundle is
 * still PENDING/PROCESSING/FAILED — the caller gets a clear "preparing"
 * error instead of an empty or partial archive.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    await checkRateLimit({ bucket: "download-original-request", identifier: token, max: 20, windowSeconds: 60 });
    const context = await authorizeDownloadGrant(token);
    const result = await downloadBundle(context, { userAgent: request.headers.get("user-agent"), ip: getClientIp(request) });
    return NextResponse.redirect(result.url, { status: 302 });
  } catch (error) {
    return apiErrorResponse(error, {
      InvalidDownloadTokenError: { status: 404, message: new InvalidDownloadTokenError().message },
      DownloadGrantExpiredError: { status: 410, message: new DownloadGrantExpiredError().message },
      DownloadGrantRevokedError: { status: 410, message: new DownloadGrantRevokedError().message },
      DownloadGrantExhaustedError: { status: 429, message: new DownloadGrantExhaustedError().message },
      BundleNotReadyError: { status: 202, message: new BundleNotReadyError().message },
      RateLimitExceededError: { status: 429, message: new RateLimitExceededError().message },
    });
  }
}
