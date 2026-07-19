"use client";

import { useRef, useState } from "react";
import {
  useXlsxViewer,
  useXlsxViewerEditing,
  useXlsxViewerSelection,
  type XlsxCellRange,
} from "@extend-ai/react-xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  Columns3,
  Flag,
  HelpCircle,
  Loader2,
  Save,
  Sigma,
  Sparkles,
  Tags,
  Undo2,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { runSelectionCommandAction } from "@/app/admin/analyses/actions";
import { saveWorkingCopyAction } from "@/app/admin/requests/actions";
import type { SelectionEdit } from "@/lib/litchai/client";

/* ---- A1 helpers (the editor's own are module-private, so mirror them) ---- */
function colLabel(col: number) {
  let s = "";
  let v = col;
  do {
    s = String.fromCharCode(65 + (v % 26)) + s;
    v = Math.floor(v / 26) - 1;
  } while (v >= 0);
  return s;
}
function cellA1(row: number, col: number) {
  return `${colLabel(col)}${row + 1}`;
}
function normalize(range: XlsxCellRange) {
  return {
    start: { row: Math.min(range.start.row, range.end.row), col: Math.min(range.start.col, range.end.col) },
    end: { row: Math.max(range.start.row, range.end.row), col: Math.max(range.start.col, range.end.col) },
  };
}
function rangeA1(range: XlsxCellRange) {
  const n = normalize(range);
  return `${cellA1(n.start.row, n.start.col)}:${cellA1(n.end.row, n.end.col)}`;
}
function a1ToAddr(a1: string): { row: number; col: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(a1.trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}
function toBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const COMMANDS = [
  { key: "explain", label: "Explain this", icon: HelpCircle, needsInstruction: false },
  { key: "write_formula", label: "Write / fix formula", icon: Sigma, needsInstruction: true },
  { key: "clean_normalise", label: "Clean & normalise", icon: Wand2, needsInstruction: false },
  { key: "add_column", label: "Add derived column", icon: Columns3, needsInstruction: true },
  { key: "flag_anomalies", label: "Flag anomalies", icon: Flag, needsInstruction: false },
  { key: "categorise", label: "Categorise rows", icon: Tags, needsInstruction: false },
] as const;

const MAX_CELLS = 900; // bound the payload/token cost

type ProposedEdit = SelectionEdit & { before: string };

/**
 * AI in the spreadsheet (Wave 2, Step 2). Rendered INSIDE the editor's
 * XlsxViewerProvider so it can read the live selection and apply edits through
 * the same controller. The loop is: pick a command over the selection → the
 * model proposes structured cell edits → (Ask-before-edits on by default) preview
 * before→after → apply one/all → the edits are recomputed IN-BROWSER via the
 * WASM engine and any #REF!/#DIV/0! is surfaced → undo if you don't like it.
 * Nothing is auto-verified as a deliverable: the verified workbook is the
 * compiled result; this saves an *unverified* working copy.
 */
export function AiPanel({ requestId, fileName }: { requestId?: string; fileName?: string }) {
  const controller = useXlsxViewer();
  const { selection, activeCell } = useXlsxViewerSelection();
  const { setCellValue, setCellFormula, undo, readOnly } = useXlsxViewerEditing();
  const toast = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [askBeforeEdits, setAskBeforeEdits] = useState(true);
  const [explanation, setExplanation] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [proposal, setProposal] = useState<ProposedEdit[] | null>(null);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [appliedBatch, setAppliedBatch] = useState(0);
  const [verify, setVerify] = useState<"clean" | "errors" | null>(null);
  const [saving, setSaving] = useState(false);

  const range = selection ?? (activeCell ? { start: activeCell, end: activeCell } : null);
  const selectionLabel = range ? rangeA1(range) : null;

  function readSelection() {
    const sheet = controller.activeSheet;
    const ws = controller.getActiveWorksheet();
    if (!range || !sheet || !ws) return null;
    const n = normalize(range);
    const nrows = n.end.row - n.start.row + 1;
    const ncols = n.end.col - n.start.col + 1;
    const truncatedRows = Math.min(nrows, Math.max(1, Math.floor(MAX_CELLS / ncols)));
    const rows: string[][] = [];
    const formulas: (string | null)[][] = [];
    for (let r = n.start.row; r < n.start.row + truncatedRows; r++) {
      const vals: string[] = [];
      const fx: (string | null)[] = [];
      for (let c = n.start.col; c <= n.end.col; c++) {
        vals.push(ws.getFormattedValueAt(r, c) ?? "");
        fx.push(ws.getFormulaAt(r, c) || null);
      }
      rows.push(vals);
      formulas.push(fx);
    }
    // Column names = the row just above the selection, when there is one.
    const headers: string[] = [];
    if (n.start.row > 0) {
      for (let c = n.start.col; c <= n.end.col; c++) headers.push(ws.getFormattedValueAt(n.start.row - 1, c) ?? "");
    }
    const truncated = truncatedRows < nrows;
    return { selectionA1: rangeA1(range), sheetName: sheet.name, headers, rows, formulas, truncated };
  }

  function readCurrent(a1: string) {
    const ws = controller.getActiveWorksheet();
    const addr = a1ToAddr(a1);
    if (!ws || !addr) return "";
    return ws.getFormattedValueAt(addr.row, addr.col) ?? "";
  }

  /** Apply edits, recompute in-browser, and surface any error cells. */
  function applyEdits(edits: SelectionEdit[]) {
    if (readOnly) {
      toast.error("This workbook is read-only (too large to edit here).");
      return;
    }
    const addrs: { row: number; col: number }[] = [];
    let applied = 0;
    for (const e of edits) {
      const addr = a1ToAddr(e.cell);
      if (!addr) continue;
      if (e.formula) setCellFormula(addr, e.formula);
      else if (e.value !== null) setCellValue(addr, e.value);
      else continue;
      addrs.push(addr);
      applied++;
    }
    if (applied === 0) return;
    setAppliedBatch((n) => n + applied);
    controller.recalculate();
    // Verify: read the recomputed values and catch error tokens.
    const ws = controller.getActiveWorksheet();
    const errs: string[] = [];
    if (ws) {
      for (const { row, col } of addrs) {
        const cv = ws.getCalculatedValueAt(row, col);
        if (cv?.is_error) errs.push(`${cellA1(row, col)} → ${cv.asError() ?? "error"}`);
      }
    }
    setVerify(errs.length ? "errors" : "clean");
    if (errs.length) {
      setWarnings((w) => [...w, ...errs.map((e) => `After applying, ${e}`)]);
      toast.error(`${errs.length} cell(s) recomputed with an error — undo if needed.`);
    } else {
      toast.success(`Applied ${applied} edit${applied === 1 ? "" : "s"} — recomputed cleanly.`);
    }
    // Highlight what changed.
    const rows = addrs.map((a) => a.row);
    const cols = addrs.map((a) => a.col);
    controller.selectRange({
      start: { row: Math.min(...rows), col: Math.min(...cols) },
      end: { row: Math.max(...rows), col: Math.max(...cols) },
    });
    setProposal(null);
  }

  async function run(command: (typeof COMMANDS)[number]) {
    const sel = readSelection();
    if (!sel) {
      toast.error("Select some cells first.");
      return;
    }
    if (command.needsInstruction && !instruction.trim()) {
      toast.error("Type what you want first.");
      inputRef.current?.focus();
      return;
    }
    setBusy(command.key);
    setProposal(null);
    setExplanation("");
    setWarnings([]);
    setVerify(null);
    setLastCommand(command.label);
    const res = await runSelectionCommandAction({
      command: command.key,
      selectionA1: sel.selectionA1,
      sheetName: sel.sheetName,
      headers: sel.headers,
      rows: sel.rows,
      formulas: sel.formulas,
      instruction: instruction.trim() || undefined,
    });
    setBusy(null);
    if (!res.ok || !res.result) {
      toast.error(res.error || "Assistant unavailable");
      return;
    }
    const r = res.result;
    setExplanation(r.explanation);
    const w = [...r.warnings];
    if (sel.truncated) w.push("Large selection — only the first rows were sent.");
    setWarnings(w);
    if (r.edits.length === 0) {
      setProposal(null);
      return;
    }
    if (askBeforeEdits) {
      setProposal(r.edits.map((e) => ({ ...e, before: readCurrent(e.cell) })));
    } else {
      applyEdits(r.edits);
    }
  }

  function undoBatch() {
    for (let i = 0; i < appliedBatch; i++) undo();
    setAppliedBatch(0);
    setVerify(null);
    toast.success("Reverted the AI edits.");
  }

  async function save() {
    const wb = controller.workbook;
    if (!wb) return;
    if (!requestId) {
      toast.error("Open this file from a request to save a working copy.");
      return;
    }
    setSaving(true);
    try {
      const bytes = wb.saveXlsxBytes();
      const res = await saveWorkingCopyAction({
        requestId,
        fileName: fileName || "workbook.xlsx",
        base64: toBase64(bytes),
      });
      if (res.ok) toast.success("Saved working copy (unverified) to the request.");
      else toast.error(res.error || "Save failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-hairline bg-paper lg:w-[340px] lg:border-l lg:border-t-0">
      <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-brand-tint text-brand">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-ink">Sage in the sheet</p>
          <p className="truncate text-xs text-muted">
            {selectionLabel ? `Acting on ${selectionLabel}` : "Select cells to begin"}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <textarea
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Optional instruction — e.g. 'total each column' or 'add a % of revenue column'"
          rows={2}
          className="w-full resize-none rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
        />

        <div className="grid grid-cols-2 gap-2">
          {COMMANDS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => void run(c)}
              disabled={busy !== null || !selectionLabel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-2 text-left text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface disabled:opacity-50"
            >
              {busy === c.key ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" />
              ) : (
                <c.icon className="size-3.5 shrink-0 text-brand" />
              )}
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-body">
          <input
            type="checkbox"
            checked={askBeforeEdits}
            onChange={(e) => setAskBeforeEdits(e.target.checked)}
            className="size-3.5 rounded border-hairline accent-brand"
          />
          Ask before applying edits
        </label>

        {(explanation || warnings.length > 0 || verify) && (
          <div className="space-y-2 rounded-xl border border-hairline bg-surface/50 p-3 text-xs">
            {lastCommand && <p className="font-semibold text-ink">{lastCommand}</p>}
            {explanation && <p className="text-body">{explanation}</p>}
            {verify && (
              <p
                className={cn(
                  "flex items-center gap-1.5 font-medium",
                  verify === "clean"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {verify === "clean" ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <AlertTriangle className="size-3.5" />
                )}
                {verify === "clean" ? "Recomputed cleanly in-browser" : "Recompute surfaced errors"}
              </p>
            )}
            {warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        {proposal && proposal.length > 0 && (
          <div className="space-y-2 rounded-xl border border-brand/30 bg-brand-tint/40 p-3">
            <p className="text-xs font-semibold text-ink">
              {proposal.length} proposed edit{proposal.length === 1 ? "" : "s"}
            </p>
            <div className="max-h-52 space-y-1.5 overflow-y-auto">
              {proposal.map((e, i) => (
                <div key={i} className="rounded-lg bg-paper px-2.5 py-1.5 text-xs">
                  <span className="font-mono font-semibold text-brand">{e.cell}</span>
                  <div className="mt-0.5 flex items-center gap-1.5 text-body">
                    {e.before && <span className="truncate text-muted line-through">{e.before}</span>}
                    <span aria-hidden>→</span>
                    <span className="truncate font-mono text-ink">{e.formula || e.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyEdits(proposal)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover keep-brand"
              >
                Apply all
              </button>
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-body hover:bg-surface"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-hairline p-3">
        <button
          type="button"
          onClick={undoBatch}
          disabled={appliedBatch === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-body hover:bg-surface disabled:opacity-40"
        >
          <Undo2 className="size-3.5" /> Undo
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !requestId}
          title={requestId ? undefined : "Open from a request to save"}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-paper hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save working copy
        </button>
      </div>
    </aside>
  );
}
