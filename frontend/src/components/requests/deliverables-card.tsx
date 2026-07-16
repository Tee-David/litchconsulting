"use client";

import { useState } from "react";
import { Download, Loader2, PackageCheck, ShieldCheck, PencilRuler } from "lucide-react";
import type { ServiceRequestDocument } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format-date";

/** Deliverables list with short-lived presigned downloads from the private bucket. */
export function DeliverablesCard({
  requestId,
  deliverables,
  showVariant = false,
}: {
  requestId: string;
  deliverables: ServiceRequestDocument[];
  showVariant?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (deliverables.length === 0) return null;

  async function download(doc: ServiceRequestDocument) {
    setBusyId(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/docs?documentId=${doc.id}`);
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (body.ok && body.url) {
        window.location.assign(body.url);
      } else {
        setError(body.error || "Could not prepare the download.");
      }
    } catch {
      setError("Could not prepare the download — please try again.");
    }
    setBusyId(null);
  }

  return (
    <div className="rounded-card border border-emerald-500/30 bg-emerald-500/[0.04] p-5">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Your deliverables
        </h3>
      </div>
      <ul className="space-y-2">
        {deliverables.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-xl2 border border-hairline bg-paper p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{doc.fileName}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {formatDateTime(doc.createdAt)}
                {showVariant && doc.publishVariant && (
                  <span className="inline-flex items-center gap-1">
                    ·{" "}
                    {doc.publishVariant === "verified" ? (
                      <>
                        <ShieldCheck className="size-3.5 text-emerald-500" /> verified build
                      </>
                    ) : (
                      <>
                        <PencilRuler className="size-3.5 text-amber-500" /> manual override
                      </>
                    )}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === doc.id}
              onClick={() => void download(doc)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {busyId === doc.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Download
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
