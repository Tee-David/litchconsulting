"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDashed,
  FileUp,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RequiredDocument } from "@/lib/services/catalog";
import type { ServiceRequestDocument } from "@/lib/db/schema";
import { recordRequestDocumentAction } from "@/app/dashboard/requests/actions";
import { formatDateTime } from "@/lib/format-date";

/**
 * Guided required-documents checklist (casap-style inspo): one slot per
 * required doc with upload → progress → done states, re-upload supersedes,
 * plus an "anything else" slot for extra files. Uploads go straight to the
 * PRIVATE bucket via a presigned PUT from /api/requests/[id]/docs.
 */

type SlotState =
  | { phase: "idle" }
  | { phase: "uploading"; pct: number }
  | { phase: "saving" }
  | { phase: "error"; message: string };

const ACCEPT = ".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg";

export function DocsChecklist({
  requestId,
  required,
  documents,
  canUpload,
}: {
  requestId: string;
  required: RequiredDocument[];
  documents: ServiceRequestDocument[]; // current (non-superseded) client uploads
  canUpload: boolean;
}) {
  const uploadedByKey = new Map(
    documents.filter((d) => d.checklistKey).map((d) => [d.checklistKey!, d])
  );
  const extras = documents.filter((d) => !d.checklistKey);

  return (
    <div className="rounded-card border border-hairline bg-paper p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Your documents
        </h3>
        {required.length > 0 && (
          <span className="text-xs font-medium text-body">
            {required.filter((r) => uploadedByKey.has(r.key)).length}/{required.length} required
          </span>
        )}
      </div>

      <div className="space-y-3">
        {required.map((slot) => (
          <DocSlot
            key={slot.key}
            requestId={requestId}
            slot={slot}
            existing={uploadedByKey.get(slot.key)}
            canUpload={canUpload}
          />
        ))}

        {/* Extra files — always available while uploads are open */}
        <DocSlot
          requestId={requestId}
          slot={{
            key: "",
            label: "Anything else that might help",
            description: "Optional — supporting schedules, notes, prior reports…",
            required: false,
          }}
          existing={undefined}
          canUpload={canUpload}
          extras={extras}
        />
      </div>
      <p className="mt-4 text-xs text-muted">
        XLSX, XLS, CSV, PDF, DOCX, PNG or JPG · up to 25 MB each · stored privately and shared only
        with your Litch advisor.
      </p>
    </div>
  );
}

function DocSlot({
  requestId,
  slot,
  existing,
  canUpload,
  extras,
}: {
  requestId: string;
  slot: RequiredDocument;
  existing?: ServiceRequestDocument;
  canUpload: boolean;
  extras?: ServiceRequestDocument[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SlotState>({ phase: "idle" });

  async function upload(file: File) {
    setState({ phase: "uploading", pct: 0 });
    try {
      const presign = await fetch(`/api/requests/${requestId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const body = (await presign.json()) as {
        ok: boolean;
        uploadUrl?: string;
        key?: string;
        error?: string;
      };
      if (!body.ok || !body.uploadUrl || !body.key) {
        setState({ phase: "error", message: body.error || "Could not start the upload." });
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", body.uploadUrl!);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setState({ phase: "uploading", pct: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error("network"));
        xhr.send(file);
      });

      setState({ phase: "saving" });
      const saved = await recordRequestDocumentAction({
        requestId,
        checklistKey: slot.key || null,
        fileName: file.name,
        contentType: file.type || undefined,
        sizeBytes: file.size,
        r2Key: body.key,
      });
      if (!saved.ok) {
        setState({ phase: "error", message: saved.error || "Upload could not be saved." });
        return;
      }
      setState({ phase: "idle" });
      router.refresh();
    } catch {
      setState({ phase: "error", message: "Upload failed — please try again." });
    }
  }

  const busy = state.phase === "uploading" || state.phase === "saving";
  const done = Boolean(existing);

  return (
    <div
      className={cn(
        "rounded-xl2 border p-4 transition-colors",
        done ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-hairline bg-surface"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
            done
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-brand-tint text-brand keep-brand"
          )}
        >
          {done ? (
            <CheckCircle2 className="size-4.5" />
          ) : slot.key ? (
            <CircleDashed className="size-4.5" />
          ) : (
            <Paperclip className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{slot.label}</p>
            {slot.key && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  slot.required ? "bg-brand-tint text-brand keep-brand" : "bg-surface text-muted"
                )}
              >
                {slot.required ? "Required" : "Optional"}
              </span>
            )}
          </div>
          {slot.description && <p className="mt-0.5 text-xs text-body">{slot.description}</p>}

          {existing && (
            <p className="mt-1.5 truncate text-xs text-body">
              <span className="font-medium text-ink">{existing.fileName}</span> ·{" "}
              {formatDateTime(existing.createdAt)}
            </p>
          )}
          {extras && extras.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {extras.map((d) => (
                <li key={d.id} className="truncate text-xs text-body">
                  <span className="font-medium text-ink">{d.fileName}</span> ·{" "}
                  {formatDateTime(d.createdAt)}
                </li>
              ))}
            </ul>
          )}

          {state.phase === "uploading" && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${state.pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">Uploading… {state.pct}%</p>
            </div>
          )}
          {state.phase === "saving" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Finishing up…
            </p>
          )}
          {state.phase === "error" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5" /> {state.message}
            </p>
          )}
        </div>

        {canUpload && !busy && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
              done
                ? "border border-hairline bg-paper text-body hover:bg-surface"
                : "bg-brand text-white hover:bg-brand-hover"
            )}
          >
            {done ? (
              <>
                <RefreshCcw className="size-3.5" /> Replace
              </>
            ) : (
              <>
                <FileUp className="size-3.5" /> Upload
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
