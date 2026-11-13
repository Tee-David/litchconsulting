"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, History, Loader2, Upload } from "lucide-react";
import { WORKBENCH_UPLOAD_ACCEPT } from "@/lib/workbench/upload-client";
import type { WbBatch, WbConversation, WbFirstLook, WbGate } from "@/lib/litchai/workbench";
import { Button, Sheet } from "@/components/kit";
import { parseRef, rangeLabel, type Range } from "./refs";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export type FileOption = { id: string; fileName: string; kind: string; stage: string | null; usable: boolean; litchaiDocumentId: string | null; litchaiStatus: string | null };

const radio = "flex cursor-pointer items-start gap-2.5 rounded-ctl border border-hairline p-2.5 has-[:checked]:border-act has-[:checked]:bg-info-soft";
const input = "w-full rounded-ctl border border-hairline bg-paper px-2.5 py-2 text-sm text-ink outline-none focus:border-act focus:ring-2 focus:ring-act/20";

// --- Add a file / sheet / workbook -------------------------------------------------
export function AttachSheet({
  open,
  onClose,
  files,
  attachedDocIds,
  workbooks,
  requestHref,
  onAttach,
  onUpload,
  onNewSheet,
  onNewWorkbook,
}: {
  open: boolean;
  onClose: () => void;
  files: FileOption[];
  attachedDocIds: Set<string>;
  workbooks: Array<{ id: string; name: string }>;
  requestHref: string | null;
  onAttach: (fileIds: string[]) => Promise<boolean>;
  /** Add a file from this computer (encrypted on the server). */
  onUpload: (file: File) => Promise<boolean>;
  onNewSheet: (workbookId: string, name: string) => Promise<boolean>;
  onNewWorkbook: (name: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"upload" | "file" | "sheet" | "book">(files.length ? "file" : "upload");
  const [upload, setUpload] = useState<File | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [wb, setWb] = useState(workbooks[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const free = files.filter((f) => !f.litchaiDocumentId || !attachedDocIds.has(f.litchaiDocumentId));

  const go = async () => {
    setBusy(true);
    const ok =
      mode === "upload" ? (upload ? await onUpload(upload) : false)
      : mode === "file" ? await onAttach(picked)
      : mode === "sheet" ? await onNewSheet(wb, name.trim())
      : await onNewWorkbook(name.trim());
    setBusy(false);
    if (ok) {
      setPicked([]);
      setName("");
      setUpload(null);
      onClose();
    }
  };
  const ready = mode === "upload" ? Boolean(upload) : mode === "file" ? picked.length > 0 : name.trim().length > 0 && (mode === "book" || wb);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Add to this workbench"
      description="Sage reads a new file first and says how it relates to what is open."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={go} disabled={!ready || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "upload" ? "Add file" : mode === "file" ? `Add ${picked.length || ""} file${picked.length === 1 ? "" : "s"}` : mode === "sheet" ? "Propose sheet" : "Propose workbook"}
          </Button>
        </>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label="What to add">
        <label className={radio}>
          <input type="radio" name="att" checked={mode === "upload"} onChange={() => setMode("upload")} className="mt-1" />
          <span><b className="block text-sm text-ink">A file from your computer</b><span className="text-[12.5px] text-muted">XLSX, XLS, ODS, CSV, TSV, TXT, JSON, DOCX or PDF, up to 4 MB</span></span>
        </label>
        {mode === "upload" && (
          <label className="ml-6 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-ctl border border-dashed border-line-strong px-3 py-2 text-[13px] text-body hover:bg-cloud">
            <Upload className="size-4 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{upload ? upload.name : "Choose a file"}</span>
            <input type="file" accept={WORKBENCH_UPLOAD_ACCEPT} className="sr-only" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <label className={radio}>
          <input type="radio" name="att" checked={mode === "file"} onChange={() => setMode("file")} className="mt-1" />
          <span><b className="block text-sm text-ink">A file from this request</b><span className="text-[12.5px] text-muted">{free.length ? `${free.length} not open yet` : "Every file is already open"}</span></span>
        </label>
        {mode === "file" && (
          <div className="ml-6 space-y-1.5">
            {free.length === 0 ? (
              <p className="text-[12.5px] text-muted">
                Upload a new file to the request first{requestHref ? <> (<a className="text-accent underline" href={`${requestHref}?tab=deliverables`}>open the request</a>)</> : null}, then add it here.
              </p>
            ) : (
              free.map((f) => (
                <label key={f.id} className={cn("flex items-center gap-2 rounded-ctl px-2 py-1.5 text-[13px]", f.usable ? "cursor-pointer hover:bg-cloud" : "opacity-60")}>
                  <input
                    type="checkbox"
                    disabled={!f.usable}
                    checked={picked.includes(f.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))}
                  />
                  {/\.pdf$/i.test(f.fileName) ? <FileText className="size-4 text-bad" aria-hidden /> : <FileSpreadsheet className="size-4 text-good" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-ink">{f.fileName}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {!f.usable ? (f.litchaiStatus === "failed" ? "Could not be read" : "Still reading") : f.kind === "deliverable" ? (f.stage === "final" ? "Final" : "Draft") : "From client"}
                  </span>
                </label>
              ))
            )}
          </div>
        )}
        <label className={radio}>
          <input type="radio" name="att" checked={mode === "sheet"} onChange={() => setMode("sheet")} className="mt-1" />
          <span><b className="block text-sm text-ink">A new blank sheet</b><span className="text-[12.5px] text-muted">Proposed like any change: accept it to add it.</span></span>
        </label>
        {mode === "sheet" && (
          <div className="ml-6 grid gap-2 sm:grid-cols-2">
            <Select aria-label="Workbook" value={wb} onChange={setWb} options={workbooks.map((w) => ({ value: w.id, label: w.name }))} />
            <input aria-label="Sheet name" className={input} placeholder="Sheet name" maxLength={31} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <label className={radio}>
          <input type="radio" name="att" checked={mode === "book"} onChange={() => setMode("book")} className="mt-1" />
          <span><b className="block text-sm text-ink">A new workbook</b><span className="text-[12.5px] text-muted">Or describe one to Sage and it lays it out.</span></span>
        </label>
        {mode === "book" && (
          <div className="ml-6">
            <input aria-label="Workbook name" className={input} placeholder="e.g. CIT computation FY2025" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
      </div>
    </Sheet>
  );
}

// --- Point Sage at a range (optional context) --------------------------------------
export function RangeSheet({
  open,
  onClose,
  look,
  selection,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  look: WbFirstLook | null;
  selection: Range | null;
  onUse: (r: Range | null) => void;
}) {
  const tables = (look?.workbooks ?? []).flatMap((w) => w.sheets.filter((s) => s.table).map((s) => ({ sheet: s.sheet, range: s.table!.range })));
  const [pick, setPick] = useState<string>("whole");
  const [typed, setTyped] = useState("");
  const typedRange = typed.trim() ? parseRef(typed.trim()) : null;

  const use = () => {
    if (typed.trim()) {
      if (!typedRange) return;
      onUse(typedRange);
    } else if (pick === "whole") onUse(null);
    else if (pick === "sel") onUse(selection);
    else onUse(parseRef(pick));
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title="Point Sage at a range"
      description="Optional. Sage still reads more if it needs to."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={use} disabled={Boolean(typed.trim()) && !typedRange}>Use this</Button>
        </>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label="Range">
        <label className={radio}>
          <input type="radio" name="rg" checked={pick === "whole"} onChange={() => setPick("whole")} className="mt-1" />
          <span><b className="block text-sm text-ink">Whole workbook</b><span className="text-[12.5px] text-muted">Default. Sage decides what to read.</span></span>
        </label>
        {tables.map((t) => {
          const ref = `${t.sheet}!${t.range}`;
          return (
            <label key={ref} className={radio}>
              <input type="radio" name="rg" checked={pick === ref} onChange={() => setPick(ref)} className="mt-1" />
              <span><b className="block text-sm text-ink">Sheet: {t.sheet}</b><span className="font-mono text-[12px] text-muted">{t.range}</span></span>
            </label>
          );
        })}
        <label className={cn(radio, !selection && "opacity-60")}>
          <input type="radio" name="rg" disabled={!selection} checked={pick === "sel"} onChange={() => setPick("sel")} className="mt-1" />
          <span><b className="block text-sm text-ink">Current selection</b><span className="text-[12.5px] text-muted">{selection ? rangeLabel(selection) : "Nothing selected"}</span></span>
        </label>
        <label className="block pt-1 text-sm">
          <span className="mb-1 block font-medium text-ink">Or type a range</span>
          <input className={cn(input, "font-mono")} placeholder="Ledger!D2:D140" value={typed} onChange={(e) => setTyped(e.target.value)} aria-invalid={Boolean(typed.trim()) && !typedRange} />
          {typed.trim() && !typedRange ? <span className="mt-1 block text-[12px] text-bad">Write it as Sheet!A1 or Sheet!A1:D20.</span> : null}
        </label>
      </div>
    </Sheet>
  );
}

// --- Edit a proposal before accepting ------------------------------------------------
export function EditBatchSheet({
  batch,
  onClose,
  onAccept,
}: {
  batch: WbBatch | null;
  onClose: () => void;
  onAccept: (edits: Record<number, { new_value?: unknown; new_formula?: string }>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const ops = (batch?.ops ?? []).map((o, i) => ({ o, i })).filter(({ o }) => o.op === "set_cell").slice(0, 60);
  const shown = (o: (typeof ops)[number]["o"]) => o.new_formula ?? (o.new_value === null || o.new_value === undefined ? "" : String(o.new_value));

  const save = async () => {
    const edits: Record<number, { new_value?: unknown; new_formula?: string }> = {};
    for (const [k, v] of Object.entries(draft)) {
      const i = Number(k);
      const t = v.trim();
      if (t.startsWith("=")) edits[i] = { new_formula: t };
      else edits[i] = { new_value: t !== "" && !Number.isNaN(Number(t.replace(/,/g, ""))) ? Number(t.replace(/,/g, "")) : t || null };
    }
    setBusy(true);
    const ok = await onAccept(edits);
    setBusy(false);
    if (ok) {
      setDraft({});
      onClose();
    }
  };

  return (
    <Sheet
      open={Boolean(batch)}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={batch ? `Edit: ${batch.title}` : "Edit"}
      description="Change any proposed cell, then accept. Formulas start with =. Your edits are noted in the audit trail."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Accept {Object.keys(draft).length ? `with ${Object.keys(draft).length} edit${Object.keys(draft).length === 1 ? "" : "s"}` : "as proposed"}
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] overflow-auto rounded-ctl border border-hairline">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-cloud text-left text-[11px] text-muted">
            <tr><th className="px-2 py-1.5">Cell</th><th className="px-2 py-1.5">Proposed</th><th className="hidden px-2 py-1.5 sm:table-cell">Why</th></tr>
          </thead>
          <tbody>
            {ops.map(({ o, i }) => (
              <tr key={i} className="border-t border-hairline align-top">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11.5px] text-ink">{o.sheet}!{o.cell}</td>
                <td className="px-2 py-1">
                  <input
                    aria-label={`Value for ${o.sheet}!${o.cell}`}
                    className={cn(input, "py-1 font-mono text-[12px]", draft[i] !== undefined && "border-diff-chg-line")}
                    value={draft[i] ?? shown(o)}
                    onChange={(e) => setDraft((d) => ({ ...d, [i]: e.target.value }))}
                  />
                </td>
                <td className="hidden px-2 py-1.5 text-muted sm:table-cell">{o.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {batch && batch.ops.filter((o) => o.op === "set_cell").length > ops.length ? (
        <p className="mt-2 text-[12px] text-muted">Showing the first {ops.length} cells. Accept, then edit the rest in the file, or ask Sage to change them.</p>
      ) : null}
    </Sheet>
  );
}

// --- Final actions: save draft / send for review / send final --------------------------
export function DeliverSheet({
  open,
  onClose,
  workbooks,
  defaultWorkbook,
  requestLabel,
  reviewRound,
  pendingCount,
  onDeliver,
}: {
  open: boolean;
  onClose: () => void;
  workbooks: Array<{ id: string; name: string; gate: WbGate | null }>;
  defaultWorkbook: string;
  requestLabel: string;
  reviewRound: number;
  pendingCount: number;
  onDeliver: (input: { workbookId: string; mode: "draft" | "review" | "final"; fileName: string; note?: string }) => Promise<boolean>;
}) {
  const [wb, setWb] = useState(defaultWorkbook);
  const [mode, setMode] = useState<"draft" | "review" | "final">("draft");
  const book = workbooks.find((w) => w.id === wb) ?? workbooks[0];
  const [fileName, setFileName] = useState(book?.name.replace(/\.(xlsx|xlsm|csv|pdf)$/i, "") ?? "Workbook");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const ok = await onDeliver({ workbookId: wb, mode, fileName, note: note.trim() || undefined });
    setBusy(false);
    if (ok) onClose();
  };
  const label = mode === "draft" ? "Save draft" : mode === "review" ? "Send for review" : "Send final";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Send to the client project"
      description={requestLabel}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={go} disabled={busy || !fileName.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} {busy ? "Recomputing…" : label}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-ctl border border-info/30 bg-info-soft px-3 py-2 text-[12.5px] text-ink">
          The file is recomputed first (every formula, in LibreOffice). If any formula errors, nothing is sent and you see which cells.
          {pendingCount ? <b className="mt-1 block">{pendingCount} proposal{pendingCount === 1 ? " is" : "s are"} not accepted yet and will not be in the file.</b> : null}
        </div>
        {workbooks.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Workbook</span>
            <Select aria-label="Workbook" value={wb} onChange={setWb} options={workbooks.map((w) => ({ value: w.id, label: w.name }))} />
          </label>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Send as</legend>
          {([
            ["draft", "Save as a draft", "Kept on the request for the team. The client does not see it yet."],
            ["review", `Draft for client review (round ${reviewRound + 1})`, "The client approves it or asks for changes."],
            ["final", "Final deliverable", "The client can download it and the request moves to Delivered."],
          ] as const).map(([v, t, d]) => (
            <label key={v} className={radio}>
              <input type="radio" name="dk" checked={mode === v} onChange={() => setMode(v)} className="mt-1" />
              <span><b className="block text-sm text-ink">{t}</b><span className="text-[12.5px] text-muted">{d}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">File name</span>
          <span className="flex items-center gap-1"><input className={input} value={fileName} maxLength={100} onChange={(e) => setFileName(e.target.value)} /><span className="text-muted">.xlsx</span></span>
        </label>
        {mode !== "draft" && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Note to the client (optional)</span>
            <textarea className={cn(input, "min-h-20")} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed in this version, and anything still open." />
          </label>
        )}
      </div>
    </Sheet>
  );
}

// --- Versions -------------------------------------------------------------------------
/** Who made a version and how: you (by name), Sage, an undo, or a restore. */
export function versionLabel(b: WbBatch | null | undefined): string {
  if (!b) return "As opened";
  if (b.inverse_of) return `Undo: ${b.title.replace(/^Undo:\s*/, "")}`;
  if (b.tool === "user_edit" || b.tool === "restore") return b.title;
  return `Sage: ${b.title}`;
}

export function HistorySheet({
  open,
  onClose,
  conversation,
  workbookId,
  downloadHref,
  previewing,
  restoring,
  onPreview,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  conversation: WbConversation;
  workbookId: string;
  downloadHref: (version: number) => string;
  /** The version shown read-only in the grid, if any. */
  previewing: number | null;
  restoring: boolean;
  onPreview: (version: number) => void;
  onRestore: (version: number) => void;
}) {
  const ref = conversation.workbooks.find((w) => w.id === workbookId);
  const titles = new Map(conversation.batches.map((b) => [b.id, b]));
  const versions = [...(ref?.versions ?? [])].reverse();
  const current = versions[0]?.n;
  const act = "inline-flex min-h-8 items-center gap-1 rounded-ctl px-2 py-1 text-[12px] font-medium text-accent hover:bg-cloud disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title="Versions"
      description={ref ? `${ref.name}. Every change saves a version. Preview any version, or restore it as a new version that you can undo.` : undefined}
    >
      <ol className="space-y-1.5">
        {versions.map((v) => {
          const b = v.batch_id ? titles.get(v.batch_id) : null;
          const isCurrent = v.n === current;
          return (
            <li key={v.n} className={cn("rounded-ctl border px-2.5 py-2 text-[13px]", previewing === v.n ? "border-accent" : "border-hairline")}>
              <div className="flex items-start gap-2">
                <span className="w-8 shrink-0 pt-px font-mono text-[12px] text-muted">v{v.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink" title={versionLabel(b)}>{versionLabel(b)}</span>
                  <span className="text-[11.5px] text-muted">
                    {new Date(v.at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {v.gate ? ` · recompute ${v.gate.status === "passed" ? "passed" : v.gate.status === "unverified" ? "not run" : v.gate.status}` : ""}
                  </span>
                </span>
                {isCurrent ? <span className="shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good">Current</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-0.5 pl-8">
                {!isCurrent ? (
                  <>
                    <button type="button" className={act} onClick={() => onPreview(v.n)} aria-label={`Preview version ${v.n}`}>
                      <FileSpreadsheet className="size-3.5" /> Preview
                    </button>
                    <button type="button" className={act} onClick={() => onRestore(v.n)} disabled={restoring} aria-label={`Restore version ${v.n}`}>
                      {restoring ? <Loader2 className="size-3.5 animate-spin" /> : <History className="size-3.5" />} Restore
                    </button>
                  </>
                ) : null}
                <a href={downloadHref(v.n)} className={act} aria-label={`Download version ${v.n}`}>
                  <Download className="size-3.5" /> Download
                </a>
              </div>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
