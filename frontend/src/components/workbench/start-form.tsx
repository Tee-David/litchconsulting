"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, FolderOpen, Loader2, Table2 } from "lucide-react";
import { Button, EmptyState } from "@/components/kit";
import { startWorkbenchAction } from "@/lib/workbench/actions";
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
  const [useBlank, setUseBlank] = useState(files.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    const res = await startWorkbenchAction({ requestId, fileIds: useBlank ? [] : picked, blank: useBlank ? blank.trim() : null });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push(`${base}/analyses/w/${res.id}`);
  };

  const ready = useBlank ? blank.trim().length > 0 : picked.length > 0;

  return (
    <section className="mt-5 rounded-card border border-hairline bg-paper p-4">
      <div className="flex gap-2" role="radiogroup" aria-label="Start from">
        {[
          { v: false, label: "Files from this request", icon: FolderOpen, disabled: !requestId },
          { v: true, label: "A new blank workbook", icon: Table2, disabled: false },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={useBlank === o.v}
            disabled={o.disabled}
            onClick={() => setUseBlank(o.v)}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-ctl border px-3 py-2.5 text-left text-sm disabled:opacity-50",
              useBlank === o.v ? "border-act bg-info-soft font-semibold text-ink" : "border-hairline text-body hover:bg-cloud",
            )}
          >
            <o.icon className="size-4 shrink-0" aria-hidden /> {o.label}
          </button>
        ))}
      </div>

      {!useBlank ? (
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
