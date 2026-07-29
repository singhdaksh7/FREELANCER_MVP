"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck, MessageSquare, X, MapPin } from "lucide-react";
import { ReviewCommentsPanel } from "./review-comments-panel";
import { RequestChangesModal } from "./request-changes-modal";
import { ApproveProjectModal } from "./approve-project-modal";
import { PaymentPanel } from "./payment-panel";
import { PinOverlay } from "./pin-overlay";
import { AnnotationCanvas } from "./annotation-canvas";
import { ClientSupportModal } from "./client-support-modal";
import type { SupportTicketSummary } from "@/data-access/support-tickets";
import { formatDateTime } from "@/lib/format-date";
import type { ReviewableFile } from "@/data-access/review-files";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";
import type { ActiveChangeRequest } from "@/data-access/change-requests";
import type { ApprovalSummary } from "@/data-access/approvals";

export interface ReviewPortalProps {
  token: string;
  workspace: {
    title: string;
    /** null for an APPROVAL_ONLY/PREVIEW_ONLY workspace with no price set. */
    amount: number | null;
    currency: string;
    creatorName: string;
    client: { name: string };
    deliveryMode: "PAYMENT_REQUIRED" | "APPROVAL_ONLY" | "PREVIEW_ONLY";
    status: string;
  };
  files: ReviewableFile[];
  comments: ReviewCommentThreadItem[];
  supportTickets: SupportTicketSummary[];
  activeChangeRequest: ActiveChangeRequest | null;
  approval: ApprovalSummary | null;
}

interface PreviewState {
  loading: boolean;
  url: string | null;
  locked: boolean;
  message: string | null;
  error: string | null;
}

export function ReviewPortal({ token, workspace, files, comments, supportTickets, activeChangeRequest, approval }: ReviewPortalProps) {
  const [activeFileId, setActiveFileId] = useState(files[0]?.id ?? null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(files[0]?.currentVersionId ?? null);
  const [reviewerName, setReviewerName] = useState(workspace.client.name ?? "");
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [approved, setApproved] = useState(Boolean(approval));
  // Set immediately on a successful "Request Changes" submission — see
  // RequestChangesModal's doc comment for why this can't rely solely on
  // the server-revalidated `activeChangeRequest` prop alone.
  const [changeRequestJustSubmitted, setChangeRequestJustSubmitted] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ loading: false, url: null, locked: false, message: null, error: null });
  const [addPinMode, setAddPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [annotateMode, setAnnotateMode] = useState(false);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  // Terminal statuses after which the portal becomes read-only — history
  // stays visible, but no further comments/approval/payment/requests/pins
  // are possible. See "Master review link behaviour" in
  // REQUIREMENTS_ALIGNMENT.md.
  const isReadOnly = workspace.status === "DELIVERED" || workspace.status === "CLOSED";
  const canPin = activeFile?.fileKind === "IMAGE" && !isReadOnly;
  const visiblePins = comments.filter(
    (c) => c.workspaceFileId === activeFileId && c.fileVersionId === activeVersionId && c.pinNumber !== null,
  );

  useEffect(() => {
    if (!activeFileId || !activeVersionId) return;
    let cancelled = false;

    async function loadPreview() {
      setPreview({ loading: true, url: null, locked: false, message: null, error: null });
      try {
        const res = await fetch(`/api/review/${token}/files/${activeFileId}/preview-url?versionId=${activeVersionId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPreview({ loading: false, url: null, locked: false, message: null, error: data.error ?? "Preview unavailable." });
          return;
        }
        if (data.locked) {
          setPreview({ loading: false, url: null, locked: true, message: data.message, error: null });
          return;
        }
        setPreview({ loading: false, url: data.url, locked: false, message: null, error: null });
      } catch {
        if (!cancelled) setPreview({ loading: false, url: null, locked: false, message: null, error: "Network error loading preview." });
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token, activeFileId, activeVersionId]);

  function selectFile(file: ReviewableFile) {
    setActiveFileId(file.id);
    setActiveVersionId(file.currentVersionId);
    setAddPinMode(false);
    setPendingPin(null);
  }

  const isPreviewOnly = workspace.deliveryMode === "PREVIEW_ONLY";
  const hasOpenChangeRequest = Boolean(activeChangeRequest) || changeRequestJustSubmitted;
  const canRequestChanges = !approved && !hasOpenChangeRequest && !isReadOnly;
  // A preview-only client can never approve for delivery — leaving a
  // comment or requesting changes is the only available action. See
  // DELIVERY_MODES.md.
  const canApprove = !approved && !hasOpenChangeRequest && !isPreviewOnly && !isReadOnly;
  const currentVersionNumber = activeFile?.versions.find((v) => v.id === activeVersionId)?.versionNumber;

  return (
    <div className="flex min-h-screen flex-col bg-vault-navy text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-vault-navy-light px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={18} className="shrink-0 text-vault-blue" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{workspace.title}</p>
            <p className="text-[11px] text-slate-400">
              Secure preview{currentVersionNumber ? ` · v${currentVersionNumber}` : ""} · shared by {workspace.creatorName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ClientSupportModal token={token} tickets={supportTickets} reviewerName={reviewerName} />
          <button
            type="button"
            onClick={() => setMobileCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white sm:hidden"
          >
            <MessageSquare size={14} aria-hidden="true" /> Comments ({comments.length})
          </button>
        </div>
      </header>

      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-400">
          No files are available for review yet.
        </div>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="flex flex-1 flex-col">
            <div className="flex gap-2 overflow-x-auto border-b border-white/10 bg-vault-navy-light px-4 py-2 sm:px-6">
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => selectFile(file)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
                    file.id === activeFileId ? "bg-vault-blue text-white" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {file.displayName}
                </button>
              ))}
            </div>

            {activeFile && activeFile.versions.length > 1 && (
              <div className="flex gap-2 border-b border-white/10 bg-vault-navy px-4 py-1.5 text-xs sm:px-6">
                {activeFile.versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setActiveVersionId(v.id);
                      setAddPinMode(false);
                      setPendingPin(null);
                    }}
                    className={`rounded px-2 py-1 ${
                      v.id === activeVersionId ? "bg-white/20 font-semibold text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    v{v.versionNumber}
                  </button>
                ))}
              </div>
            )}

            {canPin && !annotateMode && (
              <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-vault-navy px-4 py-1.5 sm:px-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddPinMode((prev) => !prev);
                      setPendingPin(null);
                    }}
                    aria-pressed={addPinMode}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                      addPinMode ? "bg-vault-blue text-white" : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <MapPin size={12} aria-hidden="true" /> {addPinMode ? "Click the image to place a pin" : "Add Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnotateMode(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10"
                  >
                    Annotate
                  </button>
                </div>
                {pendingPin && (
                  <button
                    type="button"
                    onClick={() => setPendingPin(null)}
                    className="text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel pin
                  </button>
                )}
              </div>
            )}

            <div className="relative flex flex-1 items-center justify-center bg-black/40 p-4 sm:p-8">
              {preview.loading && <p className="text-sm text-slate-400">Loading protected preview…</p>}
              {preview.error && <p className="text-sm text-danger">{preview.error}</p>}
              {preview.locked && (
                <div className="flex max-w-sm flex-col items-center gap-2 text-center">
                  <Lock size={28} className="text-slate-400" aria-hidden="true" />
                  <p className="text-sm text-slate-300">{preview.message}</p>
                </div>
              )}
              {preview.url && (
                <div className="relative inline-block max-h-[70vh] w-full max-w-3xl">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed preview URL, not a static asset */}
                  <img
                    src={preview.url}
                    alt={`Protected preview of ${activeFile?.displayName ?? "file"}`}
                    className="max-h-[70vh] w-full rounded-md object-contain"
                  />
                  {annotateMode && activeFileId && activeVersionId ? (
                    <AnnotationCanvas
                      token={token}
                      workspaceFileId={activeFileId}
                      fileVersionId={activeVersionId}
                      reviewerName={reviewerName}
                      onClose={() => setAnnotateMode(false)}
                    />
                  ) : (
                    <PinOverlay
                      pins={visiblePins}
                      addPinMode={addPinMode}
                      pendingPin={pendingPin}
                      highlightedCommentId={highlightedCommentId}
                      onPlacePin={(x, y) => {
                        setPendingPin({ x, y });
                        setAddPinMode(false);
                        setMobileCommentsOpen(true);
                      }}
                      onSelectPin={(commentId) => {
                        setHighlightedCommentId(commentId);
                        setMobileCommentsOpen(true);
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-vault-navy-light p-3 text-center text-[11px] text-slate-400 sm:p-4" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
              Original files remain securely locked until payment is completed.
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-vault-navy-light p-3 sm:p-4">
              {approved || approval ? (
                <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
                  <p className="text-sm font-semibold text-success">
                    Approved{approval ? ` by ${approval.reviewerName} on ${formatDateTime(approval.approvedAt)}` : ""}
                  </p>
                  {workspace.deliveryMode === "PAYMENT_REQUIRED" ? (
                    <PaymentPanel
                      token={token}
                      amount={workspace.amount ?? 0}
                      currency={workspace.currency}
                      workspaceTitle={workspace.title}
                      creatorName={workspace.creatorName}
                      clientName={workspace.client.name}
                    />
                  ) : workspace.status === "FILES_UNLOCKED" || workspace.status === "DELIVERED" ? (
                    <p className="text-xs text-slate-400">
                      Files released — use your download link from earlier in this conversation, or ask the creator
                      to resend it.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Approved — waiting for the creator to release files.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {isPreviewOnly && isReadOnly && (
                    <p role="status" className="w-full text-center text-xs text-slate-400">
                      This project is closed. Comment and version history remain visible, but no further comments or
                      changes can be submitted.
                    </p>
                  )}
                  {isPreviewOnly && !isReadOnly && (
                    <p role="status" className="w-full text-center text-xs text-slate-400">
                      This is a preview-only project — leave a comment or request changes below. Original files are
                      not released through Project Vault.
                    </p>
                  )}
                  {hasOpenChangeRequest && (
                    <p role="status" className="w-full text-center text-xs text-warning">
                      Change request submitted — waiting on a new revision before you can approve.
                    </p>
                  )}
                  {canRequestChanges && (
                    <RequestChangesModal
                      token={token}
                      reviewerName={reviewerName}
                      onSubmitted={() => setChangeRequestJustSubmitted(true)}
                    />
                  )}
                  {canApprove && (
                    <ApproveProjectModal
                      token={token}
                      amount={workspace.amount}
                      deliveryMode={workspace.deliveryMode}
                      files={files}
                      reviewerName={reviewerName}
                      onApproved={() => setApproved(true)}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <aside className="hidden w-[380px] shrink-0 flex-col gap-4 border-l border-white/10 bg-vault-navy-light p-4 lg:flex">
            <h2 className="text-sm font-bold text-white">Comments</h2>
            <div className="text-ink">
              <ReviewCommentsPanel
                token={token}
                comments={comments}
                activeFileId={activeFileId}
                activeVersionId={activeVersionId}
                reviewerName={reviewerName}
                onReviewerNameChange={setReviewerName}
                readOnly={isReadOnly}
                pendingPin={pendingPin}
                onPinCommentSubmitted={() => setPendingPin(null)}
                highlightedCommentId={highlightedCommentId}
                onSelectComment={setHighlightedCommentId}
              />
            </div>
          </aside>
        </div>
      )}

      {mobileCommentsOpen && (
        <div className="fixed inset-0 z-20 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Comments">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close comments"
            onClick={() => setMobileCommentsOpen(false)}
          />
          <div
            className="relative max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 text-ink"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Comments</h2>
              <button type="button" onClick={() => setMobileCommentsOpen(false)} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ReviewCommentsPanel
              token={token}
              comments={comments}
              activeFileId={activeFileId}
              activeVersionId={activeVersionId}
              reviewerName={reviewerName}
              onReviewerNameChange={setReviewerName}
              readOnly={isReadOnly}
              pendingPin={pendingPin}
              onPinCommentSubmitted={() => setPendingPin(null)}
              highlightedCommentId={highlightedCommentId}
              onSelectComment={setHighlightedCommentId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
