"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { Badge } from "@/components/admin/ui/badge";
import { PipelineStepper, TERMINAL, statusTone } from "@/components/admin/analyses/pipeline-stepper";
import { getDocumentStatusAction } from "@/app/admin/analyses/actions";
import { relayRequestDocumentAction } from "@/app/admin/requests/actions";

/**
 * Live status for the Analyses REVIEW page itself — previously this page only
 * ever rendered a static "Status: X" string baked in at request time, with no
 * indication anything was happening and no way to tell a genuine in-progress
 * pipeline from one silently stuck. Polls until the pipeline reaches a
 * terminal state; on failure, shows the real reason and (when this document
 * came from a request) a working retry.
 */
export function ReviewStatusBanner({
  documentId,
  initialStatus,
  retryTarget,
}: {
  documentId: number;
  initialStatus: string;
  retryTarget: { requestId: string; docId: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [reason, setReason] = useState<string | undefined>();
  const [refreshing, startRefresh] = useTransition();
  const [retrying, setRetrying] = useState(false);
  const pollingRef = useRef(true);

  useEffect(() => {
    pollingRef.current = !TERMINAL.has(status.toLowerCase());
    if (!pollingRef.current) return;
    let active = true;
    let elapsed = 0;
    const tick = async () => {
      const res = await getDocumentStatusAction(documentId);
      if (!active) return;
      if (res.ok && res.status) {
        setStatus(res.status);
        setReason(res.reason);
      }
    };
    void tick(); // immediate first check — don't make them wait 3s to see anything
    const id = setInterval(() => {
      elapsed += 3000;
      void tick();
      if (elapsed >= 5 * 60 * 1000) clearInterval(id); // stop after 5 min of no terminal state
    }, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when status crosses into/out of terminal
  }, [documentId, TERMINAL.has(status.toLowerCase())]);

  function manualRefresh() {
    startRefresh(async () => {
      const res = await getDocumentStatusAction(documentId);
      if (res.ok && res.status) {
        setStatus(res.status);
        setReason(res.reason);
      } else if (!res.ok) {
        toast.error(res.error || "Could not refresh");
      }
    });
  }

  async function retry() {
    if (!retryTarget) return;
    setRetrying(true);
    const res = await relayRequestDocumentAction(retryTarget.requestId, retryTarget.docId);
    setRetrying(false);
    if (!res.ok) return toast.error(res.error || "Reanalyze failed");
    toast.success("Sent for reanalysis");
    router.refresh();
  }

  const inFlight = !TERMINAL.has(status.toLowerCase());

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={statusTone(status)}>{status.replace(/_/g, " ")}</Badge>
        <PipelineStepper status={status} reason={reason} onRetry={retryTarget ? retry : undefined} retrying={retrying} />
      </div>
      <button
        type="button"
        onClick={manualRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", (refreshing || inFlight) && "animate-spin")} /> Refresh
      </button>
    </div>
  );
}
