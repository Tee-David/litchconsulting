"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";

/** Presigned private-bucket download for a request document (admin hub). */
export function DocDownloadButton({
  requestId,
  documentId,
}: {
  requestId: string;
  documentId: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/docs?documentId=${documentId}`);
      const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (body.ok && body.url) window.location.assign(body.url);
      else toast.error(body.error || "Could not prepare the download.");
    } catch {
      toast.error("Could not prepare the download — please try again.");
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
      title="Download"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
    </button>
  );
}
