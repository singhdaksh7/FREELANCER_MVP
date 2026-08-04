/**
 * The message shown for a file whose FileKind has no generated-preview
 * capability at all (ARCHIVE/OTHER — see file-kind.ts's isPreviewableFileKind).
 * Delivery-mode-aware: APPROVAL_ONLY never involves payment, so a
 * payment-mentioning message there is simply wrong, not just imprecise —
 * see the review-portal/file-card locked-file card this feeds.
 */
export function unpreviewableFileLockedMessage(deliveryMode: string): string {
  if (deliveryMode === "PAYMENT_REQUIRED") {
    return "Preview is not available for this file type. The original remains protected until approval, payment, and freelancer release.";
  }
  return "Preview is not available for this file type. The original remains protected until approval and freelancer release.";
}
