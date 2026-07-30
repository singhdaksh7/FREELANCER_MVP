import type { Metadata } from "next";
import { AlertOctagon, ShieldOff, Ban, TimerOff } from "lucide-react";
import {
  authorizeDownloadGrant,
  InvalidDownloadTokenError,
  DownloadGrantExpiredError,
  DownloadGrantRevokedError,
  DownloadGrantExhaustedError,
  type DownloadContext,
} from "@/data-access/download-auth";
import { ReviewSystemState } from "@/components/review/review-system-state";
import { DownloadHub } from "@/components/download/download-hub";

// Never statically cached — every request re-authorizes the download
// token from the database. See SECURE_DOWNLOAD_ARCHITECTURE.md.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Secure Download",
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

type LoadResult =
  | { kind: "ready"; context: DownloadContext }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "exhausted" }
  | { kind: "invalid" }
  | { kind: "error" };

/**
 * All data access + error handling happens here, outside any JSX — same
 * pattern as /review/[token]/page.tsx's loadReviewPortal, since
 * constructing JSX inside a try/catch is unsafe (JSX construction doesn't
 * throw synchronously the way the surrounding catch would expect).
 */
async function loadDownloadHub(token: string): Promise<LoadResult> {
  try {
    const context = await authorizeDownloadGrant(token);
    return { kind: "ready", context };
  } catch (error) {
    if (error instanceof DownloadGrantExpiredError) return { kind: "expired" };
    if (error instanceof DownloadGrantRevokedError) return { kind: "revoked" };
    if (error instanceof DownloadGrantExhaustedError) return { kind: "exhausted" };
    if (error instanceof InvalidDownloadTokenError) return { kind: "invalid" };
    console.error("Download page failed to load:", error);
    return { kind: "error" };
  }
}

export default async function DownloadTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadDownloadHub(token);

  switch (result.kind) {
    case "ready":
      return <DownloadHub token={token} context={result.context} />;
    case "expired":
      return (
        <ReviewSystemState
          code="EXPIRED"
          title="Download Link Expired"
          message="This secure download link has expired. Please contact the creator for a new one."
          icon={AlertOctagon}
        />
      );
    case "revoked":
      return (
        <ReviewSystemState
          code="REVOKED"
          title="Download Link Revoked"
          message="This secure download link has been revoked. Please contact the creator."
          icon={Ban}
        />
      );
    case "exhausted":
      return (
        <ReviewSystemState
          code="LIMIT_REACHED"
          title="Download Limit Reached"
          message="This link has reached its maximum number of downloads. Please contact the creator if you need access again."
          icon={TimerOff}
        />
      );
    case "invalid":
      return (
        <ReviewSystemState
          code="INVALID"
          title="Invalid Download Link"
          message="This download link isn't valid. Double-check the link, or ask the creator to resend it."
          icon={ShieldOff}
        />
      );
    default:
      return (
        <ReviewSystemState
          code="ERROR"
          title="Something Went Wrong"
          message="We couldn't load this download page. Please try again in a moment."
          icon={ShieldOff}
        />
      );
  }
}
