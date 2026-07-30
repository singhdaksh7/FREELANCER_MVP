import { CheckCircle2, FileDown, ShieldCheck } from "lucide-react";
import { formatBytes } from "@/lib/bytes";
import { formatDateTime } from "@/lib/format-date";
import type { DownloadContext } from "@/data-access/download-auth";
import { DownloadAllButton } from "./download-all-button";

export interface DownloadHubProps {
  token: string;
  context: DownloadContext;
}

/**
 * The client's secure download hub — see SECURE_DOWNLOAD_ARCHITECTURE.md.
 * Server-rendered (data comes from the already-authorized DownloadContext);
 * only the "Download All" affordance is a small Client Component, since it
 * needs to react to a "still preparing" response.
 */
export function DownloadHub({ token, context }: DownloadHubProps) {
  const remaining = Math.max(context.maxDownloads - context.downloadCount, 0);

  return (
    <div className="min-h-screen bg-vault-navy px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2 size={32} className="text-success" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">Payment Successful — Files Unlocked</h1>
          <p className="text-sm text-slate-400">
            {context.workspace.title} · shared by {context.workspace.creatorName}
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-vault-navy-light p-4 text-center">
          <ShieldCheck size={18} className="text-vault-blue" aria-hidden="true" />
          <p className="text-xs text-slate-400">
            Payment reference: <span className="font-mono text-slate-300">{context.paymentReference}</span>
          </p>
          <p className="text-xs text-slate-400">
            Expires {formatDateTime(context.expiresAt)} · {remaining} of {context.maxDownloads} downloads remaining
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <DownloadAllButton token={token} bundleReady={context.bundleReady} />
        </div>

        <ul className="mt-6 divide-y divide-white/10 rounded-lg border border-white/10 bg-vault-navy-light">
          {context.files.map((file) => (
            <li key={file.workspaceFileId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{file.displayName}</p>
                <p className="text-xs text-slate-400">{formatBytes(file.sizeBytes)}</p>
              </div>
              <a
                href={`/api/download/${token}/files/${file.workspaceFileId}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                <FileDown size={14} aria-hidden="true" /> Download
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-xs text-slate-500">
          Having trouble? Contact {context.workspace.creatorName} directly for help with this delivery.
        </p>
      </div>
    </div>
  );
}
