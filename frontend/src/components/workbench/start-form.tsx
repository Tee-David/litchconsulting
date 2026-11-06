"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, FolderOpen, Loader2, Table2, Upload } from "lucide-react";
import { Button, EmptyState } from "@/components/kit";
import { startWorkbenchAction } from "@/lib/workbench/actions";
import { uploadToWorkbench, WORKBENCH_UPLOAD_ACCEPT } from "@/lib/workbench/upload-client";
import type { FileOption } from "./sheets";
import { cn } from "@/lib/utils";

export function StartForm({
  base,
  requestId,
  requestHref,
  files,
}: {
  base: "/admin" | "/work";
  requestId: string | null;
  requestHref: string | null;
  files: FileOption[];
}) {
  const router = useRouter();
  const usable = files.filter((f) => f.usable);
  const [picked, setPicked] = useState<string[]>(usable.slice(0, 4).map((f) => f.id));
  const [blank, setBlank] = useState(files.length ? "" : "New workbook");
  // "files" = from this request · "blank" = new workbook · "upload" = from this computer
  const [mode, setMode] = useState<"files" | "blank" | "upload">(requestId && files.length ? "files" : "upload");
  const useBlank = mode === "blank";
  const [upload, setUpload] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    if (mode === "upload") {
      if (!upload) return setBusy(false);
      const up = await uploadToWorkbench(upload, { requestId });
      if (!up.ok) {
        setBusy(false);
        setError(up.error);
        return;
      }
      router.push(`${base}/analyses/w/${up.id}`);
      return;
    }
    const res = await startWorkbenchAction({ requestId, fileIds: useBlank ? [] : picked, blank: useBlank ? blank.trim() : null });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push(`${base}/analyses/w/${res.id}`);
  };

  const ready = mode === "upload" ? Boolean(upload) : useBlank ? blank.trim().length > 0 : picked.length > 0;

  return (
    <section className="mt-4">
      <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Start from">
        {[
          { v: "upload" as const, label: "Upload from your computer", icon: Upload, disabled: false, hide: false },
          { v: "files" as const, label: "Files from this request", icon: FolderOpen, disabled: !requestId, hide: !requestId },
          { v: "blank" as const, label: "A new blank workbook", icon: Table2, disabled: false, hide: false },
        ].filter((o) => !o.hide).map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={mode === o.v}
            disabled={o.disabled}
            onClick={() => setMode(o.v)}
            className={cn(
              "flex min-h-[44px] flex-1 items-center gap-2 rounded-ctl border px-3 py-2.5 text-left text-sm disabled:opacity-50",
              mode === o.v ? "border-act bg-info-soft font-semibold text-ink" : "border-hairline text-body hover:bg-cloud",
            )}
          >
            <o.icon className="size-4 shrink-0" aria-hidden /> {o.label}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <div className="mt-4">
          <input ref={fileRef} type="file" accept={WORKBENCH_UPLOAD_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setUpload(f);
            }}
            className="flex w-full flex-col items-center gap-1 rounded-ctl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-body outline-none hover:bg-cloud focus-visible:ring-2 focus-visible:ring-act/30"
          >
            <Upload className="size-5 text-muted" aria-hidden />
            {upload ? <b className="text-ink">{upload.name}</b> : <b className="text-ink">Choose a file, or drop it here</b>}
            <span className="text-[12px] text-muted">XLSX, XLS, ODS, CSV, TSV, TXT, JSON, DOCX or PDF · up to 4 MB · encrypted before it leaves this server</span>
          </button>
        </div>
      ) : !useBlank ? (
        files.length === 0 ? (
          <EmptyState
            compact
            className="mt-4"
            icon={<FileSpreadsheet />}
            title="No spreadsheets or PDFs on this request yet"
            why="Ask the client for the ledger or bank statement, or start a blank workbook."
            action={requestHref ? <a className="text-sm font-medium text-accent underline" href={requestHref}>Open the request</a> : undefined}
          />
        ) : (
          <ul className="mt-4 space-y-1">
            {files.map((f) => (
              <li key={f.id}>
                <label className={cn("flex items-center gap-2.5 rounded-ctl px-2 py-2 text-sm", f.usable ? "cursor-pointer hover:bg-cloud" : "opacity-60")}>
                  <input
                    type="checkbox"
                    disabled={!f.usable || busy}
                    checked={picked.includes(f.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))}
                  />
                  {/\.pdf$/i.test(f.fileName) ? <FileText className="size-4 text-bad" aria-hidden /> : <FileSpreadsheet className="size-4 text-good" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-ink">{f.fileName}</span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {!f.usable ? (f.litchaiStatus === "failed" ? "Could not be read" : "Still being read") : f.kind === "deliverable" ? (f.stage === "final" ? "Final" : "Draft") : "From client"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )
      ) : (
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-ink">Name</span>
          <input
            value={blank}
            maxLength={80}
            onChange={(e) => setBlank(e.target.value)}
            placeholder="e.g. CIT computation FY2025"
            className="w-full rounded-ctl border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-act focus:ring-2 focus:ring-act/20"
          />
          <span className="mt-1 block text-[12px] text-muted">Then describe it to Sage and it lays it out.</span>
        </label>
      )}

      {error ? <p className="mt-3 text-sm text-bad" role="alert">{error}</p> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        {busy ? <span className="text-[12px] text-muted">Encrypting and reading the files…</span> : null}
        <Button variant="primary" onClick={open} disabled={!ready || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Open workbench
        </Button>
      </div>
    </section>
  );
}
