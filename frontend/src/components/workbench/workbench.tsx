"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Cloud,
  Eye,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Plus,
  Send,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Table2,
  Target,
  X,
} from "lucide-react";
import type { WbBatch, WbCell, WbConversation, WbEvent, WbFirstLook, WbGate } from "@/lib/litchai/workbench";
import { attachFilesAction, decideBatchAction, deliverAction, getConversationAction, runToolAction } from "@/lib/workbench/actions";
import { useToast } from "@/components/admin/ui/toaster";
import { Button, Segmented } from "@/components/kit";
import { SageIcon } from "@/components/admin/sage-icon";
import { cn } from "@/lib/utils";
import { FAILURE, engineLabel } from "@/lib/ai-words";
import { Grid, display, type GridMeta, type SelStats } from "./grid";
import { FirstLookCard } from "./first-look";
import { Proposals } from "./proposals";
import { TurnView } from "./turn";
import { WhyPopover } from "./why";
import { uploadToWorkbench } from "@/lib/workbench/upload-client";
import { AttachSheet, DeliverSheet, EditBatchSheet, HistorySheet, RangeSheet, type FileOption } from "./sheets";
import { colLetter, parseRef, rangeLabel, rangeRef, type Range } from "./refs";
import { ChartCard, type ChartProposal } from "./chart-card";
import { EngineSheet } from "./engine-sheet";
import { useVoice } from "./voice";
import { Select } from "@/components/ui/select";
import { SAGE_MAX, SAGE_MIN, clampSage, stepZoom, useWorkbenchPrefs } from "./layout";

type Live = { message: string; selection: string | null; events: WbEvent[] };

export type WorkbenchProps = {
  initial: WbConversation;
  firstLook: WbFirstLook | null;
  request: { id: string; number: string; href: string; reviewRound: number } | null;
  files: FileOption[];
  /** LitchAI document ids whose original is a PDF we can show beside the grid. */
  pdfDocs: number[];
  canDeliver: boolean;
};

function lastGate(c: WbConversation, wbId: string): WbGate | null {
  const ref = c.workbooks.find((w) => w.id === wbId);
  return ref?.versions[ref.versions.length - 1]?.gate ?? null;
}

export function Workbench({ initial, firstLook, request, files, pdfDocs, canDeliver }: WorkbenchProps) {
  const toast = useToast();
  const [conv, setConv] = useState(initial);
  const [look, setLook] = useState(firstLook);
  const [wbId, setWbId] = useState(initial.workbooks[0]?.id ?? "");
  const [sheetBy, setSheetBy] = useState<Record<string, string>>({});
  const [sheetsBy, setSheetsBy] = useState<Record<string, string[]>>(() =>
    Object.fromEntries((firstLook?.workbooks ?? []).map((w) => [w.workbook_id, w.sheet_names])),
  );
  const baseSheets = useMemo(
    () => Object.fromEntries((look?.workbooks ?? []).map((w) => [w.workbook_id, new Set(w.sheet_names)])),
    [look],
  );
  const [gridVersion, setGridVersion] = useState(0);
  const [live, setLive] = useState<Live | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const [text, setText] = useState("");
  const [selection, setSelection] = useState<Range | null>(null);
  const [context, setContext] = useState<Range | null>(null);
  const [highlights, setHighlights] = useState<Range[]>([]);
  const [focus, setFocus] = useState<{ r: number; c: number; nonce: number } | null>(null);
  const [activeCell, setActiveCell] = useState<{ cell: WbCell | null; r: number; c: number } | null>(null);
  const [why, setWhy] = useState<{ cell: WbCell | null; ref: string; rect: DOMRect | null } | null>(null);
  const [view, setView] = useState<"sheet" | "sage">("sheet");
  const [busyBatch, setBusyBatch] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState<null | "attach" | "range" | "deliver" | "history" | "engine">(null);
  const [editing, setEditing] = useState<WbBatch | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [gateErrors, setGateErrors] = useState<string[] | null>(null);
  const [charts, setCharts] = useState<Record<string, ChartProposal>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  // The Sage panel is mounted once: beside the grid on desktop, in a bottom sheet below lg.
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Layout: Split (sheet + Sage), Focus (sheet only, Sage opens inside the editor), and Full screen.
  const [prefs, setPrefs] = useWorkbenchPrefs();
  const [full, setFull] = useState(false);
  const [focusSage, setFocusSage] = useState(false);
  // Phase E1: show formulas, status bar, find, name box, view menu.
  const [showFormulas, setShowFormulas] = useState(false);
  const [stats, setStats] = useState<SelStats | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState("");
  const [find, setFind] = useState<{ q: string; nonce: number; dir: 1 | -1 } | null>(null);
  const [findRes, setFindRes] = useState<{ index: number; total: number; capped: boolean } | null>(null);
  const [nameBox, setNameBox] = useState<string | null>(null);
  const [viewMenu, setViewMenu] = useState(false);
  const findInput = useRef<HTMLInputElement>(null);
  const runFind = (dir: 1 | -1, q = findQ) => setFind({ q, nonce: Date.now(), dir });
  const openFind = () => {
    setFindOpen(true);
    setTimeout(() => findInput.current?.select(), 0);
  };
  const toggleFormulas = useCallback(() => setShowFormulas((v) => !v), []);
  useEffect(() => {
    if (!viewMenu) return;
    const close = () => setViewMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [viewMenu]);
  const split = prefs.layout === "split";
  const zoomBy = useCallback((step: 1 | -1 | 0) => setPrefs({ zoom: stepZoom(prefs.zoom, step) }), [prefs.zoom, setPrefs]);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc leaves full screen, unless a sheet or popover is open (Esc closes that first).
      if (e.key === "Escape" && full && !sheetOpen && !why && !editing) setFull(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j" && desktop) {
        e.preventDefault();
        if (split) setPrefs({ layout: "focus" });
        setFocusSage((o) => (split ? true : !o));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, sheetOpen, why, editing, desktop, split, setPrefs]);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [full]);

  // Drag the divider to set the Sage width (split layout).
  const startResize = (e: React.PointerEvent) => {
    const box = shell.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => setPrefs({ sageWidth: clampSage(box.right - ev.clientX) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    // While dragging, the whole page shows the resize cursor and no text gets selected.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const sheet = sheetBy[wbId] ?? sheetsBy[wbId]?.[0] ?? "Sheet1";
  const activeRef = conv.workbooks.find((w) => w.id === wbId) ?? null;
  const pending = conv.batches.filter((b) => b.status === "pending");
  const pendingHere = pending.filter((b) => b.ops.some((o) => o.workbook_id === wbId));
  const gate = lastGate(conv, wbId);
  const local = conv.ai_mode === "local_only";
  const hasPdf = Boolean(activeRef?.origin === "line_items" && activeRef.document_id && pdfDocs.includes(activeRef.document_id));
  const batchById = useMemo(() => new Map(conv.batches.map((b) => [b.id, b])), [conv.batches]);

  const refresh = useCallback(async () => {
    const res = await getConversationAction(conv.id);
    if (res.ok) {
      setConv(res.conversation);
      setGridVersion((v) => v + 1);
    }
    return res.ok;
  }, [conv.id]);

  const onMeta = useCallback(
    (m: GridMeta) => setSheetsBy((prev) => (prev[wbId]?.join("|") === m.sheets.join("|") ? prev : { ...prev, [wbId]: m.sheets })),
    [wbId],
  );

  // Keep the thread pinned to the newest step.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [live?.events.length, conv.messages.length]);

  // The PDF beside its extracted table: fetched once as a blob (the site
  // forbids framing its own pages; a blob: URL is allowed).
  useEffect(() => {
    if (!pdfOpen || !hasPdf || !activeRef?.document_id) return;
    let url: string | null = null;
    let gone = false;
    setPdfError(null);
    setPdfUrl(null);
    fetch(`/api/workbench/${conv.id}/pdf?doc=${activeRef.document_id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "The original PDF is not on this request." : "The PDF could not be loaded.");
        url = URL.createObjectURL(await r.blob());
        if (!gone) setPdfUrl(url);
      })
      .catch((e: Error) => !gone && setPdfError(e.message));
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdfOpen, hasPdf, activeRef?.document_id, conv.id]);

  // --- citations / navigation -----------------------------------------------------
  const goTo = useCallback(
    (ref: string) => {
      const r = parseRef(ref, sheet);
      if (!r) return;
      const owner =
        Object.entries(sheetsBy).find(([, names]) => names.some((n) => n.toLowerCase() === r.sheet.toLowerCase()))?.[0] ?? wbId;
      const exact = sheetsBy[owner]?.find((n) => n.toLowerCase() === r.sheet.toLowerCase()) ?? r.sheet;
      setWbId(owner);
      setSheetBy((p) => ({ ...p, [owner]: exact }));
      const rr = { ...r, sheet: exact, r1: Math.min(r.r1, r.r0 + 5000) };
      setHighlights((h) => [rr, ...h.filter((x) => x.sheet !== exact || rangeRef(x) !== rangeRef(rr))].slice(0, 12));
      setFocus({ r: r.r0, c: r.c0, nonce: Date.now() });
      setView("sheet");
    },
    [sheet, sheetsBy, wbId],
  );

  // --- the streamed turn ----------------------------------------------------------
  const onEvent = useCallback(
    (ev: WbEvent) => {
      setLive((l) => (l ? { ...l, events: [...l.events, ev] } : l));
      if (ev.type === "tool_call") {
        const a = (ev.args ?? {}) as Record<string, unknown>;
        if (typeof a.sheet === "string" && typeof a.range === "string") {
          const r = parseRef(`${a.sheet}!${a.range}`);
          if (r) setHighlights((h) => [r, ...h].slice(0, 12));
        }
      }
      if (ev.type === "tool_result") {
        const cites = (ev.citations as string[] | undefined) ?? [];
        const rs = cites.map((c) => parseRef(c)).filter(Boolean) as Range[];
        if (rs.length) setHighlights((h) => [...rs, ...h].slice(0, 12));
        const proposal = ev.proposal as { id: string } | null;
        const data = ev.data as Record<string, unknown> | undefined;
        if (proposal && data?.chart_preview) {
          setCharts((c) => ({ ...c, [proposal.id]: { batchId: proposal.id, preview: data.chart_preview as ChartProposal["preview"], spec: (data.spec ?? {}) as Record<string, unknown> } }));
        }
        if (proposal) void refresh();
      }
    },
    [refresh],
  );

  const send = useCallback(
    async (message: string) => {
      const msg = message.trim();
      if (!msg || running) return;
      const sel = context ?? selection;
      const selText = sel ? rangeLabel(sel) : null;
      setText("");
      setRunning(true);
      setHighlights([]);
      setLive({ message: msg, selection: selText, events: [] });
      setView("sage");
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch(`/api/workbench/${conv.id}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, selection: sel ? rangeRef(sel) : null }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          onEvent({ type: "error", message: body.error || "Sage could not start this turn." });
        } else {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let cut: number;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const frame = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              const data = frame.split("\n").find((l) => l.startsWith("data: "));
              if (data) {
                try {
                  onEvent(JSON.parse(data.slice(6)) as WbEvent);
                } catch {
                  /* a torn frame: ignore */
                }
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") onEvent({ type: "error", reason: "stopped", message: FAILURE.stopped.title });
        else onEvent({ type: "error", reason: "dropped", message: FAILURE.dropped.title });
      } finally {
        abort.current = null;
        setRunning(false);
        const ok = await refresh();
        // The saved thread now holds this turn; keep the live view only if the save failed.
        if (ok) setLive(null);
      }
    },
    [conv.id, context, selection, running, onEvent, refresh],
  );

  const retry = useCallback(() => {
    const lastUser = [...conv.messages].reverse().find((m) => m.role === "user");
    if (live?.message || lastUser) void send(live?.message ?? lastUser!.content);
  }, [conv.messages, live, send]);

  // --- proposals --------------------------------------------------------------------
  const decide = useCallback(
    async (target: WbBatch | "all", action: "accept" | "reject" | "undo", edits?: Record<number, { new_value?: unknown; new_formula?: string }>) => {
      const list = target === "all" ? conv.batches.filter((b) => b.status === "pending") : [target];
      let last: string | undefined;
      let failed = false;
      for (const b of list) {
        setBusyBatch(b.id);
        const res = await decideBatchAction({ conversationId: conv.id, batchId: b.id, action, edits });
        if (!res.ok) {
          toast.error(res.error);
          failed = true;
          break;
        }
        setConv(res.conversation);
        last = res.message;
        if (res.batch.status === "blocked") {
          toast.error(res.message ?? "Not applied.");
          failed = true;
          break;
        }
      }
      setBusyBatch(null);
      setGridVersion((v) => v + 1);
      if (!failed && last) {
        if (action === "accept" && target !== "all") {
          toast.action(last, { label: "Undo", onAction: () => void decide(target, "undo") });
        } else toast.success(target === "all" ? `${list.length} batches ${action === "accept" ? "accepted" : "rejected"}.` : last);
      }
      return !failed;
    },
    [conv.batches, conv.id, toast],
  );

  // --- final actions ------------------------------------------------------------------
  const download = async () => {
    setDownloading(true);
    setGateErrors(null);
    try {
      const name = (activeRef?.name ?? "workbook").replace(/\.(xlsx|xlsm|csv|pdf)$/i, "");
      const res = await fetch(`/api/workbench/${conv.id}/download?wb=${encodeURIComponent(wbId)}&name=${encodeURIComponent(name)}`);
      if (res.status === 409) {
        const body = await res.json();
        setGateErrors((body.gate?.errors as string[]) ?? ["Formula errors found."]);
        toast.error("Not downloaded: the recompute found formula errors.");
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      const st = res.headers.get("x-gate-status");
      toast.success(st === "passed" ? "Recompute passed. Downloaded." : "Downloaded. The recompute could not run, so it is unverified.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const voice = useVoice(useCallback((t: string) => setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t)), []));
  const selLabel = (context ?? selection) ? rangeLabel((context ?? selection)!) : null;
  const sheets = sheetsBy[wbId] ?? [sheet];
  const workbooksForSheets = conv.workbooks.map((w) => ({ id: w.id, name: w.name, gate: lastGate(conv, w.id) }));

  // --- render ---------------------------------------------------------------------------
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-3 py-2.5 sm:px-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[15px] font-semibold text-ink" title={conv.workbooks.map((w) => w.name).join(" + ")}>
          {conv.workbooks.map((w) => w.name).join(" + ") || conv.title}
        </h1>
        <p className="truncate text-[12px] text-muted">
          {request ? <Link href={request.href} className="hover:underline">{request.number}</Link> : "No request"} · {conv.client_name} · working copy, every change versioned
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <GateChip pending={pendingHere.length} gate={gate} errors={gateErrors} />
        <button
          type="button"
          onClick={() => setSheetOpen("engine")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
            local ? "bg-violet-soft text-violet" : "bg-cloud text-body",
          )}
          title="What powers Sage, and where the data goes"
        >
          {local ? <Lock className="size-3" aria-hidden /> : <Cloud className="size-3" aria-hidden />}
          {engineLabel(local ? "local" : "cloud")}
        </button>
        {hasPdf ? (
          <Button size="sm" onClick={() => setPdfOpen((o) => !o)} aria-pressed={pdfOpen}>
            <FileText className="size-3.5" /> {pdfOpen ? "Hide PDF" : "PDF side by side"}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setSheetOpen("history")} aria-label="Versions">
          <History className="size-3.5" /> <span className="hidden sm:inline">Versions</span>
        </Button>
        <Button size="sm" onClick={download} disabled={downloading || !wbId}>
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} <span className="hidden sm:inline">Download XLSX</span>
        </Button>
        {canDeliver && request ? (
          <Button size="sm" variant="primary" onClick={() => setSheetOpen("deliver")} disabled={!wbId}>
            <Send className="size-3.5" /> Send to client
          </Button>
        ) : null}
        <span className="mx-0.5 hidden h-5 w-px bg-hairline lg:block" aria-hidden />
        <div className="hidden items-center gap-1.5 lg:flex">
          <Segmented
            size="sm"
            label="Layout"
            value={prefs.layout}
            onChange={(v) => {
              setPrefs({ layout: v });
              setFocusSage(false);
            }}
            options={[
              { value: "split", label: "Split" },
              { value: "focus", label: "Focus" },
            ]}
          />
          {!split ? (
            <Button size="sm" variant={focusSage ? "secondary" : "ghost"} onClick={() => setFocusSage((o) => !o)} aria-pressed={focusSage} title="Open or close Sage (Ctrl+J)">
              <SageIcon className="size-3.5" /> Sage
              {pending.length ? <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">{pending.length}</span> : null}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setFull((f) => !f)} aria-pressed={full} aria-label={full ? "Leave full screen" : "Full screen"} title={full ? "Leave full screen (Esc)" : "Full screen"}>
            {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );

  const formulaBar = (
    <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5 text-[12.5px]">
      <input
        aria-label="Name box: type a cell or range and press Enter"
        title="Type a cell or range (D14, B3:D8, Sheet!A1) and press Enter"
        value={
          nameBox ??
          (selection && selection.sheet === sheet && (selection.r0 !== selection.r1 || selection.c0 !== selection.c1)
            ? `${colLetter(selection.c0)}${selection.r0}:${colLetter(selection.c1)}${selection.r1}`
            : activeCell
              ? `${colLetter(activeCell.c)}${activeCell.r}`
              : "")
        }
        placeholder="A1"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setNameBox(e.target.value)}
        onBlur={() => setNameBox(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && nameBox?.trim()) {
            // Go there and select it, as the name box in Excel and Sheets does.
            const target = parseRef(nameBox.trim(), sheet);
            if (target) setSelection(target);
            goTo(nameBox.trim());
            setNameBox(null);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setNameBox(null);
            e.currentTarget.blur();
          }
        }}
        className="w-24 shrink-0 rounded bg-cloud px-1.5 py-0.5 font-mono text-[11.5px] text-ink outline-none focus:bg-paper focus:ring-2 focus:ring-accent/30"
      />
      <span className="font-serif italic text-muted" aria-hidden>fx</span>
      <span className="min-w-0 flex-1 cursor-text select-text truncate font-mono text-[12px] text-ink">
        {activeCell ? activeCell.cell?.f ?? display(activeCell.cell) : ""}
      </span>
      <button type="button" onClick={openFind} className="rounded p-1 text-muted hover:bg-cloud hover:text-ink" aria-label="Find in sheet" title="Find in sheet (Ctrl+F)">
        <Search className="size-4" />
      </button>
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setViewMenu((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={viewMenu}
          className="rounded p-1 text-muted hover:bg-cloud hover:text-ink"
          aria-label="View options"
          title="View: freeze, show formulas"
        >
          <Eye className="size-4" />
        </button>
        {viewMenu ? (
          <div role="menu" aria-label="View" onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 top-full z-40 mt-1 w-64 rounded-ctl border border-hairline bg-paper p-1 text-[13px] shadow-lg">
            {[
              { label: "Freeze the first row", on: prefs.freezeRow, run: () => setPrefs({ freezeRow: !prefs.freezeRow }), keys: "" },
              { label: "Freeze the first column", on: prefs.freezeCol, run: () => setPrefs({ freezeCol: !prefs.freezeCol }), keys: "" },
              { label: "Show formulas", on: showFormulas, run: toggleFormulas, keys: "Ctrl+`" },
            ].map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitemcheckbox"
                aria-checked={it.on}
                onClick={() => {
                  it.run();
                  setViewMenu(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-ink hover:bg-cloud"
              >
                <span className={cn("grid size-4 place-items-center rounded-sm border", it.on ? "border-act bg-act text-act-ink" : "border-line-strong")} aria-hidden>
                  {it.on ? "✓" : ""}
                </span>
                <span className="flex-1">{it.label}</span>
                {it.keys ? <span className="text-[11.5px] text-muted">{it.keys}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => setSheetOpen("range")} className="rounded p-1 text-muted hover:bg-cloud hover:text-ink" aria-label="Point Sage at a range" title="Point Sage at a range">
        <Target className="size-4" />
      </button>
    </div>
  );

  const findBar = findOpen ? (
    <div className="flex items-center gap-1.5 border-b border-hairline bg-surface px-2 py-1.5" role="search" aria-label="Find in sheet">
      <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        ref={findInput}
        value={findQ}
        onChange={(e) => {
          setFindQ(e.target.value);
          setFindRes(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runFind(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            setFindOpen(false);
          }
        }}
        placeholder={`Find in ${sheet}`}
        aria-label="Find"
        className="h-7 min-w-0 flex-1 rounded-ctl border border-line-strong bg-paper px-2 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-muted" aria-live="polite">
        {findRes ? (findRes.total ? `${findRes.index} of ${findRes.total}${findRes.capped ? "+" : ""}` : "No matches") : ""}
      </span>
      <button type="button" onClick={() => runFind(-1)} disabled={!findQ.trim()} className="grid size-7 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous match" title="Previous (Shift+Enter)">
        <ChevronUp className="size-4" />
      </button>
      <button type="button" onClick={() => runFind(1)} disabled={!findQ.trim()} className="grid size-7 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next match" title="Next (Enter)">
        <ChevronDown className="size-4" />
      </button>
      <button type="button" onClick={() => setFindOpen(false)} className="grid size-7 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink" aria-label="Close find" title="Close (Esc)">
        <X className="size-4" />
      </button>
    </div>
  ) : null;

  const fmt = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const copyFigure = (label: string, n: number) => {
    void navigator.clipboard?.writeText(String(Math.round(n * 100) / 100)).then(() => toast.success(`${label} copied`)).catch(() => {});
  };
  const statusBar =
    stats && (stats.count > 1 || stats.numbers > 0) ? (
      <div className="ml-2 hidden shrink-0 items-center gap-0.5 text-[12px] text-body md:flex" aria-label="Selection figures">
        {stats.numbers > 0 ? (
          <>
            {[
              ["Sum", stats.sum],
              ["Average", stats.avg],
              ["Min", stats.min],
              ["Max", stats.max],
            ].map(([label, v]) =>
              v === null ? null : (
                <button key={label as string} type="button" onClick={() => copyFigure(label as string, v as number)} className="rounded px-1.5 py-0.5 tabular-nums hover:bg-cloud hover:text-ink" title={`Copy the ${(label as string).toLowerCase()}`}>
                  <span className="text-muted">{label}</span> {fmt(v as number)}
                </button>
              ),
            )}
          </>
        ) : null}
        <span className="px-1.5 tabular-nums"><span className="text-muted">Count</span> {stats.count.toLocaleString("en-NG")}</span>
        {stats.partial ? <span className="px-1 text-muted" title="Only the first 10,000 rows of the selection are counted">(first 10,000 rows)</span> : null}
      </div>
    ) : null;

  const legend = pendingHere.length ? (
    <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-3 py-1 text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm border border-diff-new-line bg-diff-new" />{pendingHere.reduce((a, b) => a + b.counts.new_cells, 0).toLocaleString("en-NG")} new</span>
      <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm border border-diff-chg-line bg-diff-chg" />{pendingHere.reduce((a, b) => a + b.counts.changed_cells, 0).toLocaleString("en-NG")} changed</span>
      {pendingHere.some((b) => b.counts.new_sheets) ? <span>{pendingHere.reduce((a, b) => a + b.counts.new_sheets, 0)} new sheet(s)</span> : null}
      <span className="ml-auto">Click a coloured cell to see why</span>
    </div>
  ) : null;

  const tabs = (
    <div className="flex items-center gap-1 overflow-x-auto border-t border-hairline bg-surface px-2 py-1" role="tablist" aria-label="Sheets">
      {conv.workbooks.length > 1 ? (
        <Select
          aria-label="Workbook"
          value={wbId}
          onChange={setWbId}
          options={conv.workbooks.map((w) => ({ value: w.id, label: w.name }))}
          className="mr-1 max-w-[180px] shrink-0"
        />
      ) : null}
      {sheets.map((n) => {
        const isNew = baseSheets[wbId] ? !baseSheets[wbId].has(n) : false;
        const on = n === sheet;
        return (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setSheetBy((p) => ({ ...p, [wbId]: n }))}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-ctl px-2.5 py-1 text-[12.5px]",
              on ? "bg-paper font-semibold text-ink shadow-sm" : "text-body hover:bg-cloud",
            )}
          >
            {isNew ? <i className="size-1.5 rounded-full bg-diff-new-line" aria-label="New" /> : null}
            {n}
          </button>
        );
      })}
      <span className="ml-auto" />
      {statusBar}
      <div className="flex shrink-0 items-center gap-0.5 pl-2" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(-1)} disabled={prefs.zoom <= 0.5} className="grid size-7 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink disabled:cursor-not-allowed disabled:opacity-40" aria-label="Zoom out" title="Zoom out (Ctrl + minus)">
          <Minus className="size-3.5" />
        </button>
        <button type="button" onClick={() => zoomBy(0)} className="min-w-[3.25rem] rounded-ctl px-1.5 py-1 text-center text-[12px] tabular-nums text-body hover:bg-cloud hover:text-ink" title="Back to 100 % (Ctrl + 0)" aria-label={`Zoom ${Math.round(prefs.zoom * 100)} %, reset to 100 %`}>
          {Math.round(prefs.zoom * 100)} %
        </button>
        <button type="button" onClick={() => zoomBy(1)} disabled={prefs.zoom >= 2} className="grid size-7 place-items-center rounded-ctl text-muted hover:bg-cloud hover:text-ink disabled:cursor-not-allowed disabled:opacity-40" aria-label="Zoom in" title="Zoom in (Ctrl + plus)">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );

  const gridArea = (
    <div className="flex min-h-0 flex-1 flex-col">
      {formulaBar}
      {findBar}
      {legend}
      <div className={cn("min-h-0 flex-1", pdfOpen && hasPdf && "grid grid-rows-2 xl:grid-cols-2 xl:grid-rows-1")}>
        {pdfOpen && hasPdf ? (
          <div className="min-h-0 border-b border-hairline xl:order-2 xl:border-b-0 xl:border-l">
            {pdfError ? (
              <p className="p-4 text-sm text-bad">{pdfError}</p>
            ) : pdfUrl ? (
              <iframe key={pdfPage} title="Original PDF" src={`${pdfUrl}#page=${pdfPage}`} className="size-full bg-cloud" />
            ) : (
              <p className="flex h-full items-center justify-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading the PDF…</p>
            )}
          </div>
        ) : null}
        <div className="min-h-0 h-full">
          {wbId ? (
            <Grid
              conversationId={conv.id}
              workbookId={wbId}
              sheet={sheet}
              version={gridVersion}
              highlights={highlights}
              focus={focus}
              selection={selection}
              onSelect={(r) => {
                setSelection(r);
                setContext(null);
              }}
              onCell={(cell, at, rect) => {
                setActiveCell({ cell, ...at });
                if (cell?.page && pdfOpen) setPdfPage(cell.page);
                if (rect && (cell?.pending || cell?.f)) setWhy({ cell, ref: `${sheet}!${colLetter(at.c)}${at.r}`, rect });
              }}
              onMeta={onMeta}
              zoom={prefs.zoom}
              onZoom={zoomBy}
              showFormulas={showFormulas}
              freeze={{ row: prefs.freezeRow, col: prefs.freezeCol }}
              find={find}
              onFind={setFindRes}
              onStats={setStats}
              onToggleFormulas={toggleFormulas}
              onAsk={(r, mode) => {
                setSelection(r);
                setContext(r);
                if (mode === "ask") {
                  if (desktop && !split) setFocusSage(true);
                  if (!desktop) setView("sage");
                  setTimeout(() => composer.current?.focus(), 0);
                }
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <Table2 className="size-6 text-muted" aria-hidden />
              <p className="text-sm text-body">No workbook open yet. Ask Sage to build one, or add a file.</p>
              <Button size="sm" onClick={() => setSheetOpen("attach")}><Paperclip className="size-3.5" /> Add a file</Button>
            </div>
          )}
        </div>
      </div>
      {wbId ? tabs : null}
    </div>
  );

  const history = conv.messages.map((m, i) => {
    if (m.role === "user") {
      return (
        <div key={i} className="ml-auto max-w-[88%] rounded-card rounded-br-sm bg-act px-3 py-2 text-[13.5px] text-act-ink">
          {m.selection ? <span className="mb-0.5 block font-mono text-[11px] opacity-80">{m.selection.replace(/^\(?Selection hint: /, "")}</span> : null}
          {m.content}
        </div>
      );
    }
    const steps = (m.steps ?? []) as WbEvent[];
    const final: WbEvent = { type: "final", answer: m.content, citations: m.citations ?? [], attribution: m.attribution ?? null, unverified_figures: m.unverified_figures ?? [] };
    return (
      <div key={i} className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><SageIcon className="size-4" /> Sage</p>
        <TurnView events={m.content ? [...steps, final] : [...steps, { type: "error", message: "No answer was saved for this turn." }]} running={false} onCite={goTo} onRetry={i === conv.messages.length - 1 ? retry : undefined} />
      </div>
    );
  });

  const chartCards = Object.values(charts).filter((c) => batchById.get(c.batchId)?.status === "pending");

  const panel = (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <SageIcon className="size-5" />
        <p className="text-[14px] font-semibold text-ink">Sage</p>
        <span className="truncate text-[12px] text-muted">one thread for this workbench</span>
        <button type="button" onClick={() => setSheetOpen("engine")} className="ml-auto rounded p-1 text-muted hover:bg-cloud hover:text-ink" aria-label="What powers Sage">
          <Cpu className="size-4" />
        </button>
        <button type="button" onClick={() => setView("sheet")} className="rounded p-1 text-muted hover:bg-cloud lg:hidden" aria-label="Back to the sheet">
          <X className="size-4" />
        </button>
        {!split ? (
          <button type="button" onClick={() => setFocusSage(false)} className="hidden rounded p-1 text-muted hover:bg-cloud hover:text-ink lg:block" aria-label="Close Sage" title="Close Sage (Ctrl+J)">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-live="polite">
        {look ? <FirstLookCard look={look} onCite={goTo} onSuggest={(s) => void send(s)} disabled={running} /> : null}
        {!look && conv.messages.length === 0 && !live ? (
          <p className="rounded-card border border-dashed border-hairline p-3 text-[13px] text-body">
            Ask anything about these files, with or without a selection. Sage reads first, proposes changes, and nothing changes until you accept.
          </p>
        ) : null}
        {history}
        {live ? (
          <>
            <div className="ml-auto max-w-[88%] rounded-card rounded-br-sm bg-act px-3 py-2 text-[13.5px] text-act-ink">
              {live.selection ? <span className="mb-0.5 block font-mono text-[11px] opacity-80">{live.selection}</span> : null}
              {live.message}
            </div>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><SageIcon className="size-4" /> Sage</p>
              <TurnView events={live.events} running={running} onCite={goTo} onRetry={retry} />
            </div>
          </>
        ) : null}
        {chartCards.map((c) => (
          <ChartCard
            key={c.batchId}
            conversationId={conv.id}
            proposal={c}
            sheets={sheets}
            busy={busyBatch === c.batchId}
            onReplace={(next) => {
              setCharts((all) => {
                const out = { ...all };
                delete out[c.batchId];
                out[next.batchId] = next;
                return out;
              });
              void refresh();
            }}
            onDecide={(action) => {
              const b = batchById.get(c.batchId);
              if (b) void decide(b, action);
            }}
          />
        ))}
        <Proposals
          batches={conv.batches}
          busy={busyBatch}
          onDecide={(b, a) => void decide(b, a)}
          onEdit={setEditing}
          onJump={goTo}
        />
      </div>
      <form
        className="border-t border-hairline bg-paper p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {selLabel ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-diff-sel px-2 py-0.5 font-mono text-[11.5px] text-ink">
              <span className="truncate">{selLabel}</span>
              <button
                type="button"
                aria-label="Remove range"
                onClick={() => {
                  setSelection(null);
                  setContext(null);
                }}
                className="rounded-full p-0.5 hover:bg-cloud"
              >
                <X className="size-3" />
              </button>
            </span>
          ) : (
            <span className="rounded-full bg-cloud px-2 py-0.5 text-[11.5px] text-body">
              Whole workbook · {conv.workbooks.length} file{conv.workbooks.length === 1 ? "" : "s"}
            </span>
          )}
          <button type="button" onClick={() => setSheetOpen("range")} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] text-muted hover:bg-cloud hover:text-ink">
            <Target className="size-3" /> Range
          </button>
          <button type="button" onClick={() => setSheetOpen("attach")} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] text-muted hover:bg-cloud hover:text-ink">
            <Paperclip className="size-3" /> Add
          </button>
        </div>
        {voice.listening ? (
          <p className="mb-1 flex items-center gap-1.5 text-[11.5px] text-bad" role="status">
            <span className="size-2 animate-pulse rounded-full bg-bad" /> Listening. Release to stop; edit the text before sending.
          </p>
        ) : null}
        {voice.error ? <p className="mb-1 text-[11.5px] text-bad">{voice.error}</p> : null}
        <div className="flex items-end gap-1.5">
          <textarea
            ref={composer}
            value={voice.listening && voice.transcript ? `${text.trim() ? `${text.trimEnd()} ` : ""}${voice.transcript}` : text}
            readOnly={voice.listening}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={Math.min(5, Math.max(1, text.split("\n").length))}
            placeholder={local ? "Ask Sage (local model, slower)…" : "Ask Sage about these files…"}
            aria-label="Message to Sage"
            className="min-h-10 flex-1 resize-none rounded-ctl border border-hairline bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-act focus:ring-2 focus:ring-act/15"
          />
          {voice.supported && !local ? (
            <button
              type="button"
              {...voice.handlers}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Listening, release to stop" : "Hold to talk"}
              title="Hold to talk"
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-ctl border border-hairline text-body select-none touch-none",
                voice.listening ? "border-bad bg-bad-soft text-bad" : "hover:bg-cloud",
              )}
            >
              <voice.Icon className="size-4" />
            </button>
          ) : null}
          {running ? (
            <button type="button" onClick={() => abort.current?.abort()} className="grid size-10 shrink-0 place-items-center rounded-ctl bg-ink text-paper" aria-label="Stop">
              <Square className="size-3.5" />
            </button>
          ) : (
            <button type="submit" disabled={!text.trim()} className="grid size-10 shrink-0 place-items-center rounded-ctl bg-act text-act-ink hover:bg-act-hover disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-1 text-[10.5px] text-faint">
          {local ? "Voice is off for local-only clients (the browser sends speech to an outside service). " : ""}
          Numbers come from the pipeline, never the model. Text in client files is treated as data, not instructions.
        </p>
      </form>
    </div>
  );

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden bg-paper",
        full
          ? "fixed inset-0 z-[45] h-dvh"
          : "h-[calc(100dvh-9rem)] min-h-[520px] rounded-card border border-hairline lg:h-[calc(100dvh-7.5rem)]",
      )}
      onKeyDownCapture={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          openFind();
        }
      }}
      role={full ? "dialog" : undefined}
      aria-modal={full || undefined}
      aria-label={full ? "Workbench, full screen" : undefined}
    >
      {header}
      <div className="flex items-center justify-center border-b border-hairline px-3 py-1.5 lg:hidden">
        <Segmented
          size="sm"
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: "sheet", label: "Sheet" },
            { value: "sage", label: "Sage", count: pending.length || undefined },
          ]}
        />
      </div>
      <div ref={shell} className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{gridArea}</div>
        {desktop && split ? (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Sage"
              aria-valuemin={SAGE_MIN}
              aria-valuemax={SAGE_MAX}
              aria-valuenow={prefs.sageWidth}
              tabIndex={0}
              onPointerDown={startResize}
              onDoubleClick={() => setPrefs({ sageWidth: 410 })}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setPrefs({ sageWidth: clampSage(prefs.sageWidth + 16) });
                if (e.key === "ArrowRight") setPrefs({ sageWidth: clampSage(prefs.sageWidth - 16) });
              }}
              title="Drag to resize. Double-click to reset."
              className="group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none outline-none lg:block"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent" />
            </div>
            <aside className="hidden shrink-0 lg:flex lg:flex-col" style={{ width: prefs.sageWidth }} aria-label="Sage">
              {panel}
            </aside>
          </>
        ) : null}
        {/* Focus: the sheet fills the editor; Sage opens inside it at the right edge, over the sheet. */}
        {desktop && !split ? (
          <aside
            className={cn(
              "absolute inset-y-0 right-0 z-30 hidden w-[min(420px,92%)] flex-col border-l border-hairline shadow-lg",
              focusSage && "lg:flex",
            )}
            aria-label="Sage"
            aria-hidden={!focusSage}
          >
            {panel}
          </aside>
        ) : null}
      </div>

      {/* Phone and tablet: Sage as a bottom sheet over the grid (both keep their state). */}
      {desktop ? null : view === "sage" ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Sage">
          <button type="button" aria-label="Back to the sheet" className="absolute inset-0 bg-scrim" onClick={() => setView("sheet")} />
          <div className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-2xl border-t border-hairline bg-surface shadow-2xl">
            <div className="mx-auto mt-1.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
            {panel}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setView("sage")}
          className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-act px-4 py-2.5 text-sm font-semibold text-act-ink shadow-lg lg:hidden"
        >
          <SageIcon className="size-4" /> Sage{pending.length ? <span className="rounded-full bg-paper/20 px-1.5 text-[11px]">{pending.length}</span> : null}
          {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
        </button>
      )}

      {why ? (
        <WhyPopover
          cell={why.cell}
          refText={why.ref}
          rect={why.rect}
          batch={why.cell?.pending ? batchById.get(why.cell.pending.batch_id) ?? null : null}
          onClose={() => setWhy(null)}
          onCite={(r) => {
            setWhy(null);
            goTo(r);
          }}
        />
      ) : null}

      <AttachSheet
        open={sheetOpen === "attach"}
        onClose={() => setSheetOpen(null)}
        files={files}
        attachedDocIds={new Set(conv.workbooks.map((w) => String(w.document_id ?? "")))}
        workbooks={conv.workbooks.map((w) => ({ id: w.id, name: w.name }))}
        requestHref={request?.href ?? null}
        onAttach={async (ids) => {
          const res = await attachFilesAction(conv.id, ids);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          setConv(res.conversation);
          setLook(res.firstLook);
          setSheetsBy((p) => ({ ...p, ...Object.fromEntries(res.firstLook.workbooks.map((w) => [w.workbook_id, w.sheet_names])) }));
          const added = res.conversation.workbooks[res.conversation.workbooks.length - 1];
          if (added) setWbId(added.id);
          toast.success(res.message ?? "Added.");
          return true;
        }}
        onUpload={async (file) => {
          const res = await uploadToWorkbench(file, { conversationId: conv.id });
          if (!res.ok || !res.conversation || !res.firstLook) {
            toast.error(res.ok ? "The file was added, but the view did not refresh. Reload the page." : res.error);
            return false;
          }
          const look = res.firstLook;
          setConv(res.conversation);
          setLook(look);
          setSheetsBy((p) => ({ ...p, ...Object.fromEntries(look.workbooks.map((w) => [w.workbook_id, w.sheet_names])) }));
          const added = res.conversation.workbooks[res.conversation.workbooks.length - 1];
          if (added) setWbId(added.id);
          toast.success("Added. Sage has read the new file.");
          return true;
        }}
        onNewSheet={async (workbookId, name) => {
          const res = await runToolAction({ conversationId: conv.id, tool: "create_sheet", args: { name, workbook_id: workbookId } });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          await refresh();
          toast.success(`Sheet ${name} proposed. Accept it in Proposed changes.`);
          setView("sage");
          return true;
        }}
        onNewWorkbook={async (name) => {
          const res = await runToolAction({ conversationId: conv.id, tool: "create_workbook", args: { name, sheets: [{ name: "Sheet1" }] } });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          await refresh();
          toast.success(`Workbook ${name} proposed. Accept it to open it.`);
          setView("sage");
          return true;
        }}
      />
      <RangeSheet
        open={sheetOpen === "range"}
        onClose={() => setSheetOpen(null)}
        look={look}
        selection={selection}
        onUse={(r) => {
          setContext(r);
          if (!r) setSelection(null);
          if (r) goTo(rangeRef(r));
        }}
      />
      <EditBatchSheet
        batch={editing}
        onClose={() => setEditing(null)}
        onAccept={async (edits) => (editing ? decide(editing, "accept", edits) : false)}
      />
      {request && canDeliver ? (
        <DeliverSheet
          open={sheetOpen === "deliver"}
          onClose={() => setSheetOpen(null)}
          workbooks={workbooksForSheets}
          defaultWorkbook={wbId}
          requestLabel={`${request.number} · ${conv.client_name}`}
          reviewRound={request.reviewRound}
          pendingCount={pending.length}
          onDeliver={async (input) => {
            const res = await deliverAction({ conversationId: conv.id, ...input });
            if (!res.ok) {
              toast.error(res.error);
              return false;
            }
            toast.success(res.message ?? "Saved.");
            return true;
          }}
        />
      ) : null}
      {activeRef ? (
        <HistorySheet
          open={sheetOpen === "history"}
          onClose={() => setSheetOpen(null)}
          conversation={conv}
          workbookId={wbId}
          downloadHref={(v) => `/api/workbench/${conv.id}/download?wb=${encodeURIComponent(wbId)}&version=${v}&name=${encodeURIComponent(activeRef.name.replace(/\.\w+$/, ""))}`}
        />
      ) : null}
      <EngineSheet
        open={sheetOpen === "engine"}
        onClose={() => setSheetOpen(null)}
        local={local}
        provider={conv.provider}
        clientHref={request?.href.startsWith("/admin") && conv.client_id ? `/admin/clients/${conv.client_id}` : null}
      />
    </div>
  );
}

function GateChip({ pending, gate, errors }: { pending: number; gate: WbGate | null; errors: string[] | null }) {
  if (errors?.length) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-bad-soft px-2 py-0.5 text-[11.5px] font-medium text-bad" title={errors.join("\n")}>
        <ShieldAlert className="size-3" aria-hidden /> Recompute blocked: {errors.length} error{errors.length === 1 ? "" : "s"}
      </span>
    );
  }
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-medium text-warn">
        <Loader2 className="size-3" aria-hidden /> Recompute after you accept
      </span>
    );
  }
  if (gate?.status === "passed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-[11.5px] font-medium text-good" title={`${gate.formulas ?? 0} formulas, 0 errors`}>
        <ShieldCheck className="size-3" aria-hidden /> Recompute passed
      </span>
    );
  }
  if (gate?.status === "unverified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-medium text-warn" title={gate.detail ?? undefined}>
        <ShieldAlert className="size-3" aria-hidden /> Not recomputed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-[11.5px] font-medium text-body">
      <FileSpreadsheet className="size-3" aria-hidden /> Original file
    </span>
  );
}
