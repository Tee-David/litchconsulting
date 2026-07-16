"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { Badge, type BadgeTone } from "@/components/admin/ui/badge";
import {
  relayRequestDocumentAction,
  syncRequestAiStatusAction,
  publishVerifiedDeliverableAction,
} from "../actions";

type DocRow = {
  id: string;
  fileName: string;
  litchaiDocumentId: string | null;
  litchaiStatus: string | null;
};

function statusTone(status: string | null): BadgeTone {
  switch (status) {
    case "categorized":
    case "extracted":
      return "success";
    case "published":
      return "brand";
    case "rejected":
      return "danger";
    case null:
      return "neutral";
    default:
      return "info"; // received / scanning / extracting / queued …
  }
}

/**
 * LitchAI bridge on a request: relay client uploads through the blind
 * encrypt-and-forward, watch pipeline status (poll — no webhook), jump into
 * the review workspace, and publish the gate-verified workbook as the
 * deliverable. Manually-edited files use the regular deliverable upload.
 */
export function AiAnalysisCard({
  requestId,
  documents,
}: {
  requestId: string;
  documents: DocRow[];
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  if (documents.length === 0) return null;

  async function analyze(doc: DocRow) {
    setBusyId(doc.id);
    const res = await relayRequestDocumentAction(requestId, doc.id);
    setBusyId(null);
    if (!res.ok) return toast.error(res.error || "Relay failed");
    toast.success(`${doc.fileName} queued for analysis`);
  }

  function refresh() {
    startRefresh(async () => {
      const res = await syncRequestAiStatusAction(requestId);
      if (!res.ok) toast.error(res.error || "Could not refresh");
    });
  }

  async function publish(doc: DocRow) {
    if (
      !window.confirm(
        "Publish the verified (recompiled, gate-checked) workbook as this request's deliverable? The client is notified immediately."
      )
    )
      return;
    setBusyId(doc.id);
    const res = await publishVerifiedDeliverableAction(requestId, doc.id);
    setBusyId(null);
    if (!res.ok) return toast.error(res.error || "Publish failed");
    toast.success("Verified deliverable published — client notified");
  }

  return (
    <div className="rounded-card border border-hairline bg-paper">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-brand-tint text-brand">
            <Sparkles className="size-4.5" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-ink">LitchAI analysis</h3>
            <p className="text-xs text-muted">
              Blind-relay encrypted — plaintext never persists outside the VM.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Refresh status
        </button>
      </div>
      <ul className="divide-y divide-hairline">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileSpreadsheet className="size-4.5 shrink-0 text-muted" />
              <p className="truncate text-sm font-semibold text-ink">{doc.fileName}</p>
              {doc.litchaiDocumentId && (
                <Badge tone={statusTone(doc.litchaiStatus)}>
                  {(doc.litchaiStatus || "queued").replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!doc.litchaiDocumentId ? (
                <button
                  type="button"
                  onClick={() => analyze(doc)}
                  disabled={busyId === doc.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 keep-brand"
                >
                  {busyId === doc.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Analyze
                </button>
              ) : (
                <>
                  <Link
                    href={`/admin/litchai/${doc.litchaiDocumentId}`}
                    className="rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface"
                  >
                    Review
                  </Link>
                  {doc.litchaiStatus !== "published" && (
                    <button
                      type="button"
                      onClick={() => publish(doc)}
                      disabled={busyId === doc.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
                    >
                      {busyId === doc.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <PackageCheck className="size-3.5" />
                      )}
                      Publish verified
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
