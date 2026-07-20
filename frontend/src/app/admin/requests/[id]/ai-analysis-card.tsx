"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
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

// A relayed doc is "done" (needs no more polling) once it reaches one of these.
const TERMINAL = new Set([
  "categorized",
  "ready",
  "published",
  "failed",
  "rejected",
  "extraction_failed",
  "error",
]);
const FAILED = new Set(["failed", "rejected", "extraction_failed", "error"]);

const STEPS = ["Queued", "Scanning", "Extracting", "Categorizing", "Ready"] as const;

function stepIndex(status: string | null): number {
  const s = (status || "").toLowerCase();
  // Exact-match the failure states FIRST — "extraction_failed" contains "extract"
  // and would otherwise misread as "still extracting" via the substring checks below.
  if (FAILED.has(s)) return -1;
  if (s === "published" || s === "categorized" || s === "ready" || s === "extracted") return 4;
  if (s.includes("categor")) return 3;
  if (s.includes("extract")) return 2;
  if (s.includes("scan")) return 1;
  return 0; // queued / received / processing
}

function statusTone(status: string | null): BadgeTone {
  const s = (status || "").toLowerCase();
  if (FAILED.has(s)) return "danger";
  switch (s) {
    case "categorized":
    case "extracted":
    case "ready":
      return "success";
    case "published":
      return "brand";
    case "":
      return "neutral";
    default:
      return "info"; // received / scanning / extracting / queued …
  }
}

/** Live pipeline stepper — replaces the old "click, then nothing happens". */
function AnalysisStepper({
  status,
  reason,
  onRetry,
  retrying,
}: {
  status: string | null;
  reason?: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const active = stepIndex(status);
  if (active < 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          {reason ? `Analysis couldn't complete: ${reason}` : "Analysis failed."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1 rounded-full border border-red-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
        >
          {retrying ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          Reanalyze
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active && active < 4;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                done && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                i === active && active === 4 && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                current && "bg-brand-tint text-brand",
                i > active && "text-muted"
              )}
            >
              {done ? (
                <Check className="size-2.5" />
              ) : current ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : null}
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-[10px] text-hairline">·</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * LitchAI bridge on a request: relay client uploads through the blind
 * encrypt-and-forward, then WATCH the pipeline live (auto-poll — there's no
 * webhook) with a progress stepper, jump into the review workspace, and publish
 * the gate-verified workbook as the deliverable.
 */
export function AiAnalysisCard({
  requestId,
  documents,
}: {
  requestId: string;
  documents: DocRow[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});

  const liveStatus = (d: DocRow) => statusMap[d.id] ?? d.litchaiStatus;

  // Auto-poll while any relayed doc is still in flight; stop when all terminal.
  useEffect(() => {
    const inFlight = documents.some(
      (d) => d.litchaiDocumentId && !TERMINAL.has((statusMap[d.id] ?? d.litchaiStatus ?? "").toLowerCase())
    );
    if (!inFlight) return;
    let active = true;
    let elapsed = 0;
    const id = setInterval(async () => {
      elapsed += 3000;
      const res = await syncRequestAiStatusAction(requestId);
      if (!active) return;
      if (res.ok && res.statuses) setStatusMap((prev) => ({ ...prev, ...res.statuses }));
      if (res.ok && res.reasons) setReasonMap((prev) => ({ ...prev, ...res.reasons }));
      if (elapsed >= 5 * 60 * 1000) clearInterval(id); // give up after 5 min
    }, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [documents, statusMap, requestId]);

  if (documents.length === 0) return null;

  async function analyze(doc: DocRow) {
    setBusyId(doc.id);
    const res = await relayRequestDocumentAction(requestId, doc.id);
    setBusyId(null);
    if (!res.ok) return toast.error(res.error || "Relay failed");
    toast.success(`${doc.fileName} sent for analysis`);
    router.refresh(); // pull the new litchai id/status so the poller picks it up
  }

  function refresh() {
    startRefresh(async () => {
      const res = await syncRequestAiStatusAction(requestId);
      if (res.ok && res.statuses) setStatusMap((prev) => ({ ...prev, ...res.statuses }));
      if (res.ok && res.reasons) setReasonMap((prev) => ({ ...prev, ...res.reasons }));
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
    router.refresh();
  }

  const anyInFlight = documents.some(
    (d) => d.litchaiDocumentId && !TERMINAL.has((liveStatus(d) ?? "").toLowerCase())
  );

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
              {anyInFlight
                ? "Working — watching the pipeline live…"
                : "Blind-relay encrypted — plaintext never persists outside the VM."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", (refreshing || anyInFlight) && "animate-spin")} /> Refresh
        </button>
      </div>
      <ul className="divide-y divide-hairline">
        {documents.map((doc) => {
          const status = liveStatus(doc);
          const inFlight = Boolean(doc.litchaiDocumentId) && !TERMINAL.has((status ?? "").toLowerCase());
          return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="size-4.5 shrink-0 text-muted" />
                <p className="truncate text-sm font-semibold text-ink">{doc.fileName}</p>
                {doc.litchaiDocumentId && (
                  <Badge tone={statusTone(status)}>{(status || "queued").replace(/_/g, " ")}</Badge>
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
                ) : FAILED.has((status ?? "").toLowerCase()) ? null : (
                  <>
                    <Link
                      href={`/admin/analyses/${doc.litchaiDocumentId}`}
                      className="rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface"
                    >
                      Review
                    </Link>
                    {status !== "published" && (
                      <button
                        type="button"
                        onClick={() => publish(doc)}
                        disabled={busyId === doc.id || inFlight}
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
              {doc.litchaiDocumentId && (
                <div className="w-full pl-8">
                  <AnalysisStepper
                    status={status}
                    reason={reasonMap[doc.id]}
                    onRetry={() => analyze(doc)}
                    retrying={busyId === doc.id}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
