"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  Loader2,
  Trash2,
  CheckCircle2,
  CircleDashed,
  Table2,
} from "lucide-react";
import type { ServiceRequestDocument } from "@/lib/db/schema";
import type { RequiredDocument } from "@/lib/services/catalog";
import { formatDateTime } from "@/lib/format-date";
import { useToast } from "@/components/admin/ui/toaster";
import { adminDeleteRequestDocumentAction } from "../actions";

function prettySize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Admin view of a request's files: required-slot checklist state plus every
 * current client upload, with presigned downloads and delete (files tied to
 * an AI run can't be deleted — the action refuses).
 */
export function AdminDocumentList({
  requestId,
  required,
  clientUploads,
  deliverables,
}: {
  requestId: string;
  required: RequiredDocument[];
  clientUploads: ServiceRequestDocument[];
  deliverables: ServiceRequestDocument[];
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filledSlots = new Set(clientUploads.map((d) => d.checklistKey).filter(Boolean));

  async function download(doc: ServiceRequestDocument) {
    setBusyId(doc.id);
    try {
      const res = await fetch(`/api/requests/${requestId}/docs?documentId=${doc.id}`);
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (body.ok && body.url) window.location.assign(body.url);
      else toast.error(body.error || "Could not prepare the download.");
    } catch {
      toast.error("Could not prepare the download — please try again.");
    }
    setBusyId(null);
  }

  function remove(doc: ServiceRequestDocument) {
    if (!window.confirm(`Delete ${doc.fileName}? The client will no longer see it.`)) return;
    startTransition(async () => {
      const res = await adminDeleteRequestDocumentAction(requestId, doc.id);
      if (!res.ok) toast.error(res.error || "Could not delete");
      else toast.success("Document removed");
    });
  }

  function row(doc: ServiceRequestDocument, deletable: boolean) {
    return (
      <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{doc.fileName}</p>
            <p className="text-xs text-muted">
              {prettySize(doc.sizeBytes)} · {formatDateTime(doc.createdAt)}
              {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
              {doc.litchaiStatus ? ` · AI: ${doc.litchaiStatus}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/\.(xlsx|xls|csv)$/i.test(doc.fileName) && (
            <Link
              href={`/admin/analyses/editor?requestId=${requestId}&documentId=${doc.id}`}
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
              title="Open in spreadsheet editor"
            >
              <Table2 className="size-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => download(doc)}
            disabled={busyId === doc.id}
            className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
            title="Download"
          >
            {busyId === doc.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
          </button>
          {deletable && (
            <button
              type="button"
              onClick={() => remove(doc)}
              disabled={pending}
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
              title="Delete"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-paper">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h3 className="font-display text-sm font-bold text-ink">Client documents</h3>
        {required.length > 0 && (
          <span className="text-xs text-muted">
            {required.filter((d) => d.required && filledSlots.has(d.key)).length}/
            {required.filter((d) => d.required).length} required received
          </span>
        )}
      </div>

      {required.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-hairline px-5 py-3">
          {required.map((slot) => {
            const filled = filledSlots.has(slot.key);
            return (
              <span
                key={slot.key}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium " +
                  (filled
                    ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400"
                    : "border-hairline text-muted")
                }
              >
                {filled ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                {slot.label}
                {!slot.required && " (optional)"}
              </span>
            );
          })}
        </div>
      )}

      {clientUploads.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Nothing uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">{clientUploads.map((d) => row(d, true))}</ul>
      )}

      {deliverables.length > 0 && (
        <>
          <div className="border-t border-hairline px-5 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Deliverables sent
            </h4>
          </div>
          <ul className="divide-y divide-hairline">{deliverables.map((d) => row(d, false))}</ul>
        </>
      )}
    </div>
  );
}
