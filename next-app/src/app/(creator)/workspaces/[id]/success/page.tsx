import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnedWorkspaceDetail } from "@/data-access/workspaces";
import { getWorkspaceFiles } from "@/data-access/files";
import { formatINR } from "@/lib/format-currency";
import { CheckCircle2 } from "lucide-react";
import { InlineLinkGenerator } from "@/components/creator/workspace-card";

export default async function WorkspaceSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await getOwnedWorkspaceDetail(id);

  if (!workspace) {
    redirect("/dashboard");
  }

  const files = await getWorkspaceFiles(id);
  const isActionable = workspace.status !== "CANCELLED" && workspace.status !== "DELIVERED" && workspace.status !== "CLOSED" && workspace.status !== "DRAFT";

  const hasActiveReviewLink =
    workspace.reviewLink?.status === "ACTIVE" &&
    (!workspace.reviewLink.expiresAt || new Date(workspace.reviewLink.expiresAt) > new Date());

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center text-center mt-12 gap-6 p-6 rounded-xl border border-line bg-card shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success mb-2">
        <CheckCircle2 size={32} />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-primary-text">Workspace Created Successfully!</h1>
        <p className="text-sm text-secondary-text mt-2">
          Your workspace for <span className="font-semibold text-primary-text">{workspace.clientName}</span> is now ready.
        </p>
      </div>

      <div className="w-full rounded-lg border border-line bg-app-bg p-5 text-sm text-left">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-secondary-text">Project Details</dt>
            <dd className="mt-1 font-medium text-primary-text">{workspace.title}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-secondary-text">Files & Protection</dt>
            <dd className="mt-1 font-medium text-primary-text">{files.length} files attached</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold text-secondary-text">Delivery Mode</dt>
            {workspace.deliveryMode === "PAYMENT_REQUIRED" ? (
              <dd className="mt-1 font-medium text-primary-text">
                Payment Required: {formatINR(Number(workspace.amount ?? 0))}
              </dd>
            ) : (
              <dd className="mt-1 font-medium text-primary-text">Approval Only</dd>
            )}
          </div>
        </dl>
      </div>

      <div className="w-full max-w-md">
        {isActionable && (
          <div className="mb-6">
            <InlineLinkGenerator workspaceId={workspace.id} hasActiveReviewLink={hasActiveReviewLink} />
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row w-full justify-center">
          <Link
            href={`/workspaces/${workspace.id}`}
            className="flex-1 rounded-md border border-primary-blue bg-primary-blue py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-blue-dark"
          >
            Manage Workspace
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 rounded-md border border-line bg-white py-2.5 text-center text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
