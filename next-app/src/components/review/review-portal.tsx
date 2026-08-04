"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock, ShieldCheck, MessageSquare, X, MapPin, CheckCircle2, Download, Send, AlertTriangle } from "lucide-react";
import { ReviewCommentsPanel } from "./review-comments-panel";
import { RequestChangesModal } from "./request-changes-modal";
import { ApproveProjectModal } from "./approve-project-modal";
import { PaymentPanel } from "./payment-panel";
import { PinOverlay } from "./pin-overlay";
import { AnnotationCanvas } from "./annotation-canvas";
import { formatDateTime } from "@/lib/format-date";
import { InlayLogo } from "@/components/brand/inlay-logo";
import { BRAND } from "@/lib/branding";
import type { ReviewableFile } from "@/data-access/review-files";
import type { ReviewCommentThreadItem } from "@/data-access/review-comments";
import type { ActiveChangeRequest } from "@/data-access/change-requests";
import type { ApprovalSummary } from "@/data-access/approvals";

export interface ReviewPortalProps {
  token: string;
  workspace: {
    title: string;
    amount: number | null;
    currency: string;
    creatorName: string;
    client: { name: string };
    deliveryMode: "PAYMENT_REQUIRED" | "APPROVAL_ONLY" | "PREVIEW_ONLY";
    status: string;
  };
  files: ReviewableFile[];
  comments: ReviewCommentThreadItem[];
  activeChangeRequest: ActiveChangeRequest | null;
  approval: ApprovalSummary | null;
  readOnlyPreview?: boolean;
  workspaceId?: string;
}

interface PreviewState {
  loading: boolean;
  url: string | null;
  locked: boolean;
  message: string | null;
  error: string | null;
}

export function ReviewPortal({
  token,
  workspace,
  files,
  comments,
  activeChangeRequest,
  approval,
  readOnlyPreview = false,
  workspaceId,
}: ReviewPortalProps) {
  const [activeFileId, setActiveFileId] = useState(files[0]?.id ?? null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(files[0]?.currentVersionId ?? null);
  const [reviewerName, setReviewerName] = useState(workspace.client.name ?? "");
  const [mobileCommentsOpen, setMobileCommentsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "comments">("overview");
  const [approved, setApproved] = useState(Boolean(approval));
  const [changeRequestJustSubmitted, setChangeRequestJustSubmitted] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ loading: false, url: null, locked: false, message: null, error: null });
  const [addPinMode, setAddPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [annotateMode, setAnnotateMode] = useState(false);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;
  const isReadOnly = workspace.status === "DELIVERED" || workspace.status === "CLOSED" || readOnlyPreview;
  const isPaid = workspace.status === "PAID" || workspace.status === "FILES_UNLOCKED" || workspace.status === "DELIVERED";
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
        const previewUrlBase = readOnlyPreview
          ? `/api/workspaces/${workspaceId}/files`
          : `/api/review/${token}/files`;
        const res = await fetch(`${previewUrlBase}/${activeFileId}/preview-url?versionId=${activeVersionId}`);
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
  }, [token, activeFileId, activeVersionId, readOnlyPreview, workspaceId]);

  function selectFile(file: ReviewableFile) {
    setActiveFileId(file.id);
    setActiveVersionId(file.currentVersionId);
    setAddPinMode(false);
    setPendingPin(null);
  }

  const isPreviewOnly = workspace.deliveryMode === "PREVIEW_ONLY";
  const hasOpenChangeRequest = Boolean(activeChangeRequest) || changeRequestJustSubmitted;
  const canRequestChanges = !approved && !hasOpenChangeRequest && !isReadOnly;
  const canApprove = !approved && !hasOpenChangeRequest && !isPreviewOnly && !isReadOnly;
  const currentVersionNumber = activeFile?.versions.find((v) => v.id === activeVersionId)?.versionNumber;

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0F19] text-white">
      {readOnlyPreview && (
        <div role="status" className="border-b border-warning/30 bg-warning/15 px-4 py-2 text-center text-xs font-semibold text-warning">
          Preview mode — this is how your client will see the review page.
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#1F2937] bg-[#111827] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <InlayLogo container size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-black text-white">{workspace.title}</p>
              {currentVersionNumber && (
                <span className="rounded bg-primary-blue px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">
                  v{currentVersionNumber}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#9CA3AF]">
              Client: <strong className="text-white">{workspace.client.name}</strong> · Shared by {workspace.creatorName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPaid ? (
            <div className="flex items-center gap-1.5 rounded-full bg-success-bg/20 px-3 py-1 text-xs font-bold text-success">
              <Unlock size={14} /> Files Unlocked
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-warning-bg/20 px-3 py-1 text-xs font-bold text-warning">
              <Lock size={14} /> Gated Delivery Lock
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#374151] px-3 py-1.5 text-xs font-semibold text-white lg:hidden"
          >
            <MessageSquare size={14} aria-hidden="true" /> Comments ({comments.length})
          </button>
        </div>
      </header>

      {/* Main Content Workspace Grid */}
      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[#9CA3AF]">
          No files are available for review yet.
        </div>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row">
          {/* Left Canvas Panel */}
          <div className="flex flex-1 flex-col bg-[#030712]">
            {/* File Switcher Header */}
            <div data-testid="file-switcher" className="flex gap-2 overflow-x-auto border-b border-[#1F2937] bg-[#111827] px-4 py-2 sm:px-6">
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => selectFile(file)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                    file.id === activeFileId ? "bg-primary-blue text-white" : "bg-[#1F2937] text-white hover:bg-[#374151]"
                  }`}
                >
                  📄 {file.displayName}
                </button>
              ))}
            </div>

            {/* Version Switcher */}
            {activeFile && activeFile.versions.length > 1 && (
              <div className="flex gap-2 border-b border-[#1F2937] bg-[#111827] px-4 py-1.5 text-xs sm:px-6">
                {activeFile.versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setActiveVersionId(v.id);
                      setAddPinMode(false);
                      setPendingPin(null);
                    }}
                    className={`rounded px-2.5 py-1 text-xs font-bold ${
                      v.id === activeVersionId ? "bg-white/20 text-white" : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    v{v.versionNumber}
                  </button>
                ))}
              </div>
            )}

            {/* Pin Toolbar */}
            {canPin && !annotateMode && (
              <div className="flex items-center justify-between gap-2 border-b border-[#1F2937] bg-[#111827] px-4 py-1.5 text-xs sm:px-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddPinMode((prev) => !prev);
                      setPendingPin(null);
                    }}
                    aria-pressed={addPinMode}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                      addPinMode ? "bg-primary-blue text-white" : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    <MapPin size={12} aria-hidden="true" /> {addPinMode ? "Click image to pin" : "Add Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnnotateMode(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-[#9CA3AF] hover:text-white"
                  >
                    Annotate
                  </button>
                </div>
              </div>
            )}

            {/* Interactive Image Canvas */}
            <div className="relative flex flex-1 items-center justify-center p-4 sm:p-8 overflow-hidden">
              {preview.loading && <p className="text-sm text-[#9CA3AF]">Loading protected preview…</p>}
              {preview.error && <p className="text-sm text-danger">{preview.error}</p>}
              {preview.locked && (
                <div className="flex max-w-sm flex-col items-center gap-2 text-center">
                  <Lock size={28} className="text-[#9CA3AF]" aria-hidden="true" />
                  <p className="text-sm text-[#9CA3AF]">{preview.message}</p>
                </div>
              )}
              {preview.url && (
                <div className="relative inline-block max-h-[70vh] w-full max-w-3xl rounded-xl overflow-hidden shadow-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.url}
                    alt={`Protected preview of ${activeFile?.displayName ?? "file"}`}
                    className="max-h-[70vh] w-full object-contain bg-[#111827]"
                  />
                  {!isPaid && (
                    <div className="watermark-overlay absolute inset-0 pointer-events-none" />
                  )}
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
          </div>

          {/* Right Action Panel */}
          <aside className="hidden w-[380px] shrink-0 flex-col border-l border-[#1F2937] bg-[#111827] lg:flex">
            <div className="flex border-b border-[#1F2937] bg-[#1F2937]">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`flex-1 py-3 text-xs font-bold ${
                  activeTab === "overview" ? "border-b-2 border-primary-blue text-white" : "text-[#9CA3AF]"
                }`}
              >
                Action Center
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("comments")}
                className={`flex-1 py-3 text-xs font-bold ${
                  activeTab === "comments" ? "border-b-2 border-primary-blue text-white" : "text-[#9CA3AF]"
                }`}
              >
                Comments ({comments.length})
              </button>
            </div>

            {activeTab === "overview" && (
              <div className="flex flex-1 flex-col justify-between p-6 gap-6">
                <div className="flex flex-col gap-4">
                  <h2 className="text-lg font-bold text-white">Client Review Summary</h2>
                  <p className="text-xs text-[#9CA3AF] leading-relaxed">
                    Review deliverables above. Submit comments, request revisions, or approve to unlock clean original files.
                  </p>

                  <div className="rounded-xl border border-[#374151] bg-[#1F2937] p-5">
                    <span className="text-xs font-semibold text-[#9CA3AF] uppercase">Required Payment to Unlock</span>
                    <div className="mt-1 text-3xl font-black text-primary-blue">
                      {workspace.amount ? `₹${workspace.amount.toLocaleString()}` : "Approval Only"}
                    </div>
                    <p className="mt-2 text-[11px] text-[#9CA3AF]">
                      🔒 Original files unlock automatically upon payment
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {approved || approval ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-center text-xs font-bold text-success">
                        ✓ Approved{approval ? ` by ${approval.reviewerName}` : ""}
                      </p>
                      {workspace.deliveryMode === "PAYMENT_REQUIRED" && (
                        <PaymentPanel
                          token={token}
                          amount={workspace.amount ?? 0}
                          currency={workspace.currency}
                          workspaceTitle={workspace.title}
                          creatorName={workspace.creatorName}
                          clientName={workspace.client.name}
                        />
                      )}
                    </div>
                  ) : hasOpenChangeRequest ? (
                    <div role="status" className="rounded-md border border-warning/40 bg-warning-bg/10 px-3.5 py-2.5 text-center text-xs font-semibold text-warning">
                      Change request submitted. The creator has been notified and will upload a revised version for your review.
                    </div>
                  ) : (
                    <>
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
                      {canRequestChanges && (
                        <RequestChangesModal
                          token={token}
                          reviewerName={reviewerName}
                          onSubmitted={() => setChangeRequestJustSubmitted(true)}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "comments" && (
              <div className="flex flex-1 flex-col p-4">
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
            )}
          </aside>
        </div>
      )}

      {/* Mobile Comments Sheet */}
      {mobileCommentsOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Comments">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close comments"
            onClick={() => setMobileCommentsOpen(false)}
          />
          <div
            className="relative max-h-[80vh] overflow-y-auto rounded-t-2xl bg-[#111827] p-5 text-white"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-4 flex items-center justify-between border-b border-[#1F2937] pb-3">
              <h2 className="text-sm font-bold text-white">Client Feedback & Comments</h2>
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
