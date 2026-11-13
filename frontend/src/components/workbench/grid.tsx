"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { WbCell, WbSheetWindow, WbUserEdit } from "@/lib/litchai/workbench";
import { FUNCS, fillValues, hint, parseTyped, shiftFormula, stepDecimals, suggest } from "./formula-help";
import { colLetter, type Range, inRange } from "./refs";
import { cn } from "@/lib/utils";

const ROW_H = 28;
const HEAD_H = 28;
const ROWNUM_W = 52;
const BLOCK = 100;
const MAX_COLS = 60;

type Block = { cells: Map<string, WbCell> };
/** Figures for the status bar, from the selected cells. */
export type SelStats = { count: number; numbers: number; sum: number; avg: number | null; min: number | null; max: number | null; partial: boolean };
/** Status bar and Find read at most this many 100-row blocks (10,000 rows). */
const READ_CAP = 100;
export type GridMeta = { maxRow: number; maxCol: number; sheets: string[] };

/**
 * A virtualised read view of one sheet, fed in 100-row blocks by the
 * analysis server. Only the visible rows are in the DOM, so a 40,000-row
 * ledger scrolls like a 40-row one. Pending proposals are coloured (green new,
 * amber changed); AI-chosen ranges and citations get an outline.
 */
export function Grid({
  conversationId,
  workbookId,
  sheet,
  version,
  highlights,
  focus,
  selection,
  onSelect,
  onCell,
  onMeta,
  zoom = 1,
  onZoom,
  showFormulas = false,
  freeze = { row: false, col: false },
  find = null,
  onFind,
  onStats,
  onAsk,
  onToggleFormulas,
  editable = false,
  onCommit,
  formatRequest = null,
}: {
  conversationId: string;
  workbookId: string;
  sheet: string;
  /** Bump to refetch (after accept / undo / a new proposal). */
  version: number;
  highlights: Range[];
  focus: { r: number; c: number; nonce: number } | null;
  selection: Range | null;
  onSelect: (r: Range | null) => void;
  onCell: (cell: WbCell | null, at: { r: number; c: number }, rect: DOMRect | null) => void;
  onMeta?: (m: GridMeta) => void;
  /** 0.5 to 2. Rows, columns and type scale together, so text stays sharp. */
  zoom?: number;
  /** Ctrl/Cmd + wheel, pinch, or Ctrl/Cmd + "+", "-", "0" on the grid: +1 step, -1 step, or 0 = reset. */
  onZoom?: (step: 1 | -1 | 0) => void;
  /** Cells show their formulas instead of their values (Ctrl+`). */
  showFormulas?: boolean;
  /** Keep the first row and/or the first column in view while scrolling. */
  freeze?: { row: boolean; col: boolean };
  /** Find in sheet. A new nonce moves to the next (dir 1) or previous (dir -1) match. */
  find?: { q: string; nonce: number; dir: 1 | -1 } | null;
  onFind?: (r: { index: number; total: number; capped: boolean }) => void;
  onStats?: (s: SelStats | null) => void;
  /** Right-click "Ask Sage" (ask) or "Point Sage" (point) for a range. */
  onAsk?: (range: Range, mode: "ask" | "point") => void;
  onToggleFormulas?: () => void;
  /** E2: a person may type in cells. Saving is the parent's job (onCommit). */
  editable?: boolean;
  /** Save edits; resolve true when saved. The grid shows the typed text until then. */
  onCommit?: (edits: WbUserEdit[]) => Promise<boolean>;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Number format for the selection, from the toolbar. A new nonce applies it. */
  formatRequest?: { kind: "currency" | "percent" | "thousands" | "plain" | "dec+" | "dec-"; nonce: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rowH = Math.round(ROW_H * zoom);
  const headH = Math.round(HEAD_H * zoom);
  const numW = Math.round(ROWNUM_W * zoom);
  const [blocks, setBlocks] = useState<Map<number, Block>>(new Map());
  const [meta, setMeta] = useState<GridMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const loading = useRef(new Set<number>());
  const drag = useRef<{ r: number; c: number } | null>(null);
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  /** Widths the person set by dragging a column edge, in px at 100 %. Cleared with the sheet. */
  const [colW, setColW] = useState<Record<number, number>>({});
  // E2 editing: the open cell editor, and typed text shown until the new version loads.
  const [editing, setEditing] = useState<{ r: number; c: number; text: string } | null>(null);
  const editingRef = useRef<{ r: number; c: number; text: string } | null>(null);
  editingRef.current = editing;
  const [optimistic, setOptimistic] = useState<Map<string, string>>(new Map());
  const [sug, setSug] = useState(0);
  const editInput = useRef<HTMLInputElement>(null);
  // E2.6 fill handle: the cell the drag has reached, while dragging.
  const [fillTo, setFillTo] = useState<{ r: number; c: number } | null>(null);
  // The cache is dropped only for a new sheet; a new version refreshes in place (below).
  const key = `${conversationId}|${workbookId}|${sheet}`;
  const keyRef = useRef(key);

  const load = useCallback(
    async (b: number) => {
      if (loading.current.has(b)) return;
      loading.current.add(b);
      const want = keyRef.current;
      const r0 = b * BLOCK + 1;
      try {
        const qs = new URLSearchParams({ wb: workbookId, sheet, r0: String(r0), r1: String(r0 + BLOCK - 1), c0: "1", c1: String(MAX_COLS) });
        const res = await fetch(`/api/workbench/${conversationId}/cells?${qs}`, { cache: "no-store" });
        const body = (await res.json()) as WbSheetWindow & { error?: string };
        if (want !== keyRef.current) return;
        if (!res.ok) throw new Error(body.error || "This sheet could not be read.");
        const cells = new Map<string, WbCell>();
        for (const c of body.cells) cells.set(`${c.r}:${c.c}`, c);
        setBlocks((prev) => new Map(prev).set(b, { cells }));
        const m = { maxRow: Math.max(1, body.max_row), maxCol: Math.max(1, Math.min(MAX_COLS, body.max_col)), sheets: body.sheets };
        setMeta(m);
        onMeta?.(m);
        setError(null);
      } catch (e) {
        if (want === keyRef.current) setError(e instanceof Error ? e.message : "This sheet could not be read.");
      } finally {
        loading.current.delete(b);
      }
    },
    [conversationId, workbookId, sheet, onMeta],
  );

  // New sheet / version → drop the cache and read from the top.
  useEffect(() => {
    keyRef.current = key;
    loading.current.clear();
    setBlocks(new Map());
    setError(null);
    setMeta(null);
    setColW({});
    setOptimistic(new Map());
    setEditing(null);
    void load(0);
  }, [key, load]);

  // A new version of the same sheet (a save, an accept, an undo): refresh the loaded
  // blocks in place. The cells stay on screen until the new values arrive, so nothing
  // blinks, and a fill or paste started now still reads real cells.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const seenVersion = useRef(version);
  useEffect(() => {
    if (version === seenVersion.current) return;
    seenVersion.current = version;
    const ids = [...blocksRef.current.keys()];
    loading.current.clear();
    void Promise.all((ids.length ? ids : [0]).map((b) => load(b))).then(() => setOptimistic(new Map()));
  }, [version, load]);

  // The data extent, and the view extent. Like Excel, the view goes 100 rows and
  // 10 columns past the data (at least A to Z), so a person can type below or beside it.
  const dataRow = Math.max(1, meta?.maxRow ?? 1);
  const dataCol = Math.max(1, meta?.maxCol ?? 1);
  const maxRow = meta ? dataRow + 100 : 0;
  const maxCol = Math.min(MAX_COLS, Math.max(dataCol + 10, 26));
  const first = Math.max(1, Math.floor((view.top - headH) / rowH) - 10);
  const last = Math.min(maxRow, Math.ceil((view.top + view.height) / rowH) + 10);

  useEffect(() => {
    if (!meta) return;
    for (let b = Math.floor((first - 1) / BLOCK); b <= Math.floor((last - 1) / BLOCK); b++) {
      if (!blocks.has(b)) void load(b);
    }
  }, [first, last, meta, blocks, load]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const sync = () => setView({ top: el.scrollTop, height: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cellAt = useCallback(
    (r: number, c: number) => blocks.get(Math.floor((r - 1) / BLOCK))?.cells.get(`${r}:${c}`) ?? null,
    [blocks],
  );

  // Column widths from what is loaded (headers and the first rows).
  const widths = useMemo(() => {
    const w: number[] = [];
    const b0 = blocks.get(0);
    for (let c = 1; c <= maxCol; c++) {
      let n = 4;
      for (let r = 1; r <= Math.min(40, maxRow); r++) {
        const v = b0?.cells.get(`${r}:${c}`)?.v;
        if (v !== null && v !== undefined) n = Math.max(n, String(typeof v === "number" ? v.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : v).length);
      }
      w.push(Math.round((colW[c] ?? Math.max(72, Math.min(300, n * 7.4 + 22))) * zoom));
    }
    return w;
  }, [blocks, maxCol, maxRow, zoom, colW]);

  // Drag the right edge of a column letter to resize it, as in Excel. Double-click resets it.
  const startColResize = (c: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = (widths[c - 1] ?? 72) / zoom;
    const body = document.body.style;
    const prev = { cursor: body.cursor, select: body.userSelect };
    body.cursor = "col-resize";
    body.userSelect = "none";
    const move = (ev: MouseEvent) => setColW((m) => ({ ...m, [c]: Math.round(Math.max(36, Math.min(900, w0 + (ev.clientX - x0) / zoom))) }));
    const up = () => {
      body.cursor = prev.cursor;
      body.userSelect = prev.select;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Click a column letter or a row number to select the whole column or row; Shift extends.
  const pickHeader = (kind: "col" | "row", n: number, e: React.MouseEvent) => {
    if (startPan(e)) return;
    if (e.button !== 0) return;
    e.preventDefault();
    box.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    const lastRow = dataRow;
    const from = e.shiftKey && selection && selection.sheet === sheet ? selection : null;
    const range: Range =
      kind === "col"
        ? { sheet, r0: 1, r1: lastRow, c0: from ? Math.min(from.c0, n) : n, c1: from ? Math.max(from.c1, n) : n }
        : { sheet, r0: from ? Math.min(from.r0, n) : n, r1: from ? Math.max(from.r1, n) : n, c0: 1, c1: dataCol };
    if (!from) setActive(kind === "col" ? { r: 1, c: n } : { r: n, c: 1 });
    onSelect(range);
  };
  const colPicked = (c: number) => Boolean(selection && selection.sheet === sheet && c >= selection.c0 && c <= selection.c1);
  const rowPicked = (r: number) => Boolean(selection && selection.sheet === sheet && r >= selection.r0 && r <= selection.r1);

  // Keep the same part of the sheet in view when the zoom changes.
  const lastZoom = useRef(zoom);
  useEffect(() => {
    const el = box.current;
    const k = zoom / lastZoom.current;
    lastZoom.current = zoom;
    if (!el || k === 1) return;
    el.scrollTop = el.scrollTop * k;
    el.scrollLeft = el.scrollLeft * k;
    setView({ top: el.scrollTop, height: el.clientHeight });
  }, [zoom]);

  // Ctrl/Cmd + wheel (and trackpad pinch, which the browser reports the same way) zooms.
  // A native listener, because React's wheel listener is passive and cannot stop page zoom.
  const hasMeta = meta !== null;
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !zoomRef.current) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 40) return;
      zoomRef.current(acc < 0 ? 1 : -1);
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // The grid element only exists once the sheet metadata has loaded.
  }, [hasMeta]);

  // Pan: hold Space and drag, or drag with the middle button, as in drawing and map tools.
  const [space, setSpace] = useState(false);
  const pan = useRef<{ x: number; y: number; top: number; left: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const startPan = (e: React.MouseEvent) => {
    const el = box.current;
    if (!el) return false;
    if (!(e.button === 1 || (e.button === 0 && space))) return false;
    e.preventDefault();
    pan.current = { x: e.clientX, y: e.clientY, top: el.scrollTop, left: el.scrollLeft };
    setPanning(true);
    const move = (ev: MouseEvent) => {
      if (!pan.current) return;
      el.scrollTop = pan.current.top - (ev.clientY - pan.current.y);
      el.scrollLeft = pan.current.left - (ev.clientX - pan.current.x);
    };
    const up = () => {
      pan.current = null;
      setPanning(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return true;
  };
  const left = useMemo(() => {
    const out = [numW];
    widths.forEach((w) => out.push(out[out.length - 1] + w));
    return out;
  }, [widths, numW]);

  // Jump to a cited cell. Only a new citation moves the view: a zoom step changes the
  // offsets too, and must keep the view where it is, so the sizes are read through a ref.
  const geom = useRef({ left, rowH, headH, numW });
  geom.current = { left, rowH, headH, numW };
  const reveal = useCallback((r: number, c: number, smooth = true) => {
    const el = box.current;
    if (!el) return;
    const g = geom.current;
    const y = g.headH + (r - 1) * g.rowH;
    const x = g.left[c - 1] ?? 0;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), left: Math.max(0, x - g.numW - 40), behavior: smooth ? "smooth" : "auto" });
  }, []);
  useEffect(() => {
    if (!focus) return;
    reveal(focus.r, focus.c);
    setActive({ r: focus.r, c: focus.c });
  }, [focus, reveal]);

  // Status bar figures for the selection. Loads the selected rows if they are not loaded yet.
  useEffect(() => {
    if (!onStats) return;
    if (!selection || selection.sheet !== sheet || !meta) {
      onStats(null);
      return;
    }
    const lastSel = Math.min(selection.r1, Math.max(1, meta.maxRow));
    const b0 = Math.floor((selection.r0 - 1) / BLOCK);
    const bEnd = Math.floor((lastSel - 1) / BLOCK);
    const b1 = Math.min(bEnd, b0 + READ_CAP - 1);
    let partial = bEnd > b1;
    let count = 0, n = 0, sum = 0, min = Infinity, max = -Infinity;
    for (let b = b0; b <= b1; b++) {
      const blk = blocks.get(b);
      if (!blk) {
        partial = true;
        void load(b);
        continue;
      }
      for (const cell of blk.cells.values()) {
        if (cell.r < selection.r0 || cell.r > selection.r1 || cell.c < selection.c0 || cell.c > selection.c1) continue;
        if (cell.v === null || cell.v === undefined || cell.v === "") continue;
        count++;
        if (typeof cell.v === "number") {
          n++;
          sum += cell.v;
          if (cell.v < min) min = cell.v;
          if (cell.v > max) max = cell.v;
        }
      }
    }
    onStats({ count, numbers: n, sum, avg: n ? sum / n : null, min: n ? min : null, max: n ? max : null, partial });
  }, [selection, sheet, meta, blocks, load, onStats]);

  // Find: once the rows are loaded, move to the next or previous match from the active cell.
  const handledFind = useRef(0);
  useEffect(() => {
    if (!find || !meta || handledFind.current === find.nonce) return;
    const q = find.q.trim().toLowerCase();
    if (!q) {
      handledFind.current = find.nonce;
      onFind?.({ index: 0, total: 0, capped: false });
      return;
    }
    const lastB = Math.floor((Math.max(1, meta.maxRow) - 1) / BLOCK);
    const capB = Math.min(lastB, READ_CAP - 1);
    let missing = false;
    for (let b = 0; b <= capB; b++) {
      if (!blocks.has(b)) {
        missing = true;
        void load(b);
      }
    }
    if (missing) return; // runs again when the blocks arrive
    handledFind.current = find.nonce;
    const hits: { r: number; c: number }[] = [];
    for (let b = 0; b <= capB; b++) {
      for (const cell of blocks.get(b)!.cells.values()) {
        const text = (showFormulas && cell.f ? cell.f : display(cell)).toLowerCase();
        if (text.includes(q)) hits.push({ r: cell.r, c: cell.c });
      }
    }
    hits.sort((a, b) => a.r - b.r || a.c - b.c);
    if (!hits.length) {
      onFind?.({ index: 0, total: 0, capped: lastB > capB });
      return;
    }
    const from = active ?? { r: 0, c: 0 };
    const after = (h: { r: number; c: number }) => h.r > from.r || (h.r === from.r && h.c > from.c);
    const before = (h: { r: number; c: number }) => h.r < from.r || (h.r === from.r && h.c < from.c);
    let i = find.dir === 1 ? hits.findIndex(after) : hits.map(before).lastIndexOf(true);
    if (i < 0) i = find.dir === 1 ? 0 : hits.length - 1; // wrap round
    const hit = hits[i];
    setActive(hit);
    onSelect({ sheet, r0: hit.r, r1: hit.r, c0: hit.c, c1: hit.c });
    reveal(hit.r, hit.c);
    onFind?.({ index: i + 1, total: hits.length, capped: lastB > capB });
  }, [find, meta, blocks, load, showFormulas, active, sheet, onSelect, onFind, reveal]);

  // ---- E2: editing -------------------------------------------------------------
  const rawOf = (cell: WbCell | null) => cell?.f ?? (cell?.v === null || cell?.v === undefined ? "" : String(cell.v));
  const send = async (items: { r: number; c: number; e: Omit<WbUserEdit, "sheet" | "cell">; shown: string }[]) => {
    if (!onCommit || !items.length) return;
    setOptimistic((m) => {
      const n = new Map(m);
      for (const it of items) n.set(`${it.r}:${it.c}`, it.shown);
      return n;
    });
    const ok = await onCommit(items.map((it) => ({ sheet, cell: `${colLetter(it.c)}${it.r}`, ...it.e })));
    if (!ok) {
      setOptimistic((m) => {
        const n = new Map(m);
        for (const it of items) n.delete(`${it.r}:${it.c}`);
        return n;
      });
    }
  };
  const startEdit = (r: number, c: number, text?: string) => {
    if (!editable) return;
    setSug(0);
    setEditing({ r, c, text: text ?? rawOf(cellAt(r, c)) });
  };
  useEffect(() => {
    if (!editing) return;
    const el = editInput.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // Only when a new cell opens, not on every key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.r, editing?.c]);
  const finishEdit = (save: boolean, move: [number, number] | null) => {
    const ed = editingRef.current;
    if (!ed) return;
    editingRef.current = null;
    setEditing(null);
    if (save && ed.text !== rawOf(cellAt(ed.r, ed.c))) {
      void send([{ r: ed.r, c: ed.c, e: parseTyped(ed.text), shown: ed.text.trim().startsWith("=") ? "…" : ed.text }]);
    }
    const lastRow = Math.max(1, maxRow);
    const nx = move ? { r: Math.min(Math.max(1, ed.r + move[0]), lastRow + 1), c: Math.min(Math.max(1, ed.c + move[1]), maxCol) } : { r: ed.r, c: ed.c };
    setActive(nx);
    onSelect(rangeFrom(nx, nx));
    onCell(cellAt(nx.r, nx.c), nx, null);
    box.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  };
  /** Non-empty loaded cells in the selection (capped at the engine's 5,000). */
  const selectedCells = () => {
    const out: WbCell[] = [];
    if (!selection || selection.sheet !== sheet) return out;
    for (const blk of blocks.values()) {
      for (const cell of blk.cells.values()) {
        if (!inRange(selection, cell.r, cell.c)) continue;
        if ((cell.v === null || cell.v === undefined || cell.v === "") && !cell.f) continue;
        out.push(cell);
        if (out.length >= 5000) return out;
      }
    }
    return out;
  };
  const clearSelection = () => {
    if (!editable) return;
    void send(selectedCells().map((cell) => ({ r: cell.r, c: cell.c, e: { clear: true }, shown: "" })));
  };
  const pasteAt = async () => {
    if (!editable || !active) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    const items: { r: number; c: number; e: Omit<WbUserEdit, "sheet" | "cell">; shown: string }[] = [];
    lines.forEach((line, i) =>
      line.split("\t").forEach((v, j) => {
        if (items.length < 5000) items.push({ r: active.r + i, c: active.c + j, e: parseTyped(v), shown: v });
      }),
    );
    if (items.length) {
      const last = items[items.length - 1];
      onSelect({ sheet, r0: active.r, r1: last.r, c0: active.c, c1: Math.max(...items.map((x) => x.c)) });
    }
    await send(items);
  };
  const handledFormat = useRef(0);
  useEffect(() => {
    if (!formatRequest || handledFormat.current === formatRequest.nonce) return;
    handledFormat.current = formatRequest.nonce;
    const nfFor = (cell: WbCell) => {
      switch (formatRequest.kind) {
        case "currency": return '"₦"#,##0.00';
        case "percent": return "0.00%";
        case "thousands": return "#,##0.00";
        case "plain": return "General";
        case "dec+": return stepDecimals(cell.nf, 1);
        default: return stepDecimals(cell.nf, -1);
      }
    };
    const items = selectedCells()
      .filter((cell) => typeof cell.v === "number" || cell.f)
      .map((cell) => {
        const nf = nfFor(cell);
        return { r: cell.r, c: cell.c, e: { number_format: nf }, shown: display({ ...cell, nf }) };
      });
    void send(items);
    // Runs once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatRequest]);

  // ---- E2.6: fill handle ----------------------------------------------------------
  const cellFromPoint = (x: number, y: number) => {
    const el = box.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const gy = y - rect.top + el.scrollTop - headH;
    const gx = x - rect.left + el.scrollLeft;
    const r = Math.max(1, Math.floor(gy / rowH) + 1);
    let c = 1;
    while (c < left.length - 1 && gx >= left[c]) c++;
    return { r, c };
  };
  const doFill = (sel: Range, to: { r: number; c: number }) => {
    const down = to.r > sel.r1;
    const items: { r: number; c: number; e: Omit<WbUserEdit, "sheet" | "cell">; shown: string }[] = [];
    const lines = down ? sel.c1 - sel.c0 + 1 : sel.r1 - sel.r0 + 1;
    const count = down ? to.r - sel.r1 : to.c - sel.c1;
    for (let i = 0; i < lines; i++) {
      const src = [] as { r: number; c: number; cell: WbCell | null }[];
      if (down) for (let r = sel.r0; r <= sel.r1; r++) src.push({ r, c: sel.c0 + i, cell: cellAt(r, sel.c0 + i) });
      else for (let c = sel.c0; c <= sel.c1; c++) src.push({ r: sel.r0 + i, c, cell: cellAt(sel.r0 + i, c) });
      const hasFormula = src.some((x) => x.cell?.f);
      const values = hasFormula ? null : fillValues(src.map((x) => (x.cell?.v ?? null) as string | number | boolean | null), count);
      for (let k = 0; k < count && items.length < 5000; k++) {
        const s0 = src[k % src.length];
        const r = down ? sel.r1 + k + 1 : s0.r;
        const c = down ? s0.c : sel.c1 + k + 1;
        const nf = s0.cell?.nf && s0.cell.nf !== "General" ? s0.cell.nf : undefined;
        if (s0.cell?.f) {
          const f2 = shiftFormula(s0.cell.f, r - s0.r, c - s0.c);
          items.push({ r, c, e: { formula: f2, number_format: nf }, shown: "…" });
        } else {
          const v = values ? values[k] : null;
          if (v === null || v === undefined || v === "") items.push({ r, c, e: { clear: true }, shown: "" });
          else items.push({ r, c, e: { value: v as string | number | boolean, number_format: nf }, shown: display({ ...(s0.cell as WbCell), v: v as string | number | boolean, f: null, pending: null }) });
        }
      }
    }
    if (!items.length) return;
    onSelect({ sheet, r0: sel.r0, r1: down ? to.r : sel.r1, c0: sel.c0, c1: down ? sel.c1 : to.c });
    void send(items);
  };
  const startFill = (e: React.MouseEvent) => {
    if (!editable || !selection || selection.sheet !== sheet || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = selection;
    let target: { r: number; c: number } | null = null;
    const body = document.body.style;
    const prev = body.cursor;
    body.cursor = "crosshair";
    const move = (ev: MouseEvent) => {
      const p = cellFromPoint(ev.clientX, ev.clientY);
      if (!p) return;
      const dr = p.r - sel.r1;
      const dc = p.c - sel.c1;
      target = dr > 0 && dr >= dc ? { r: Math.min(p.r, maxRow), c: sel.c1 } : dc > 0 ? { r: sel.r1, c: Math.min(p.c, maxCol) } : null;
      setFillTo(target);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      body.cursor = prev;
      setFillTo(null);
      if (target) doFill(sel, target);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Right-click menu.
  const [menu, setMenu] = useState<{ x: number; y: number; range: Range } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  const onContext = (e: React.MouseEvent) => {
    const cellEl = (e.target as HTMLElement).closest("[data-r]") as HTMLElement | null;
    if (!cellEl) return;
    e.preventDefault();
    const r = Number(cellEl.dataset.r);
    const c = Number(cellEl.dataset.c);
    let range = selection && selection.sheet === sheet && inRange(selection, r, c) ? selection : null;
    if (!range) {
      range = { sheet, r0: r, r1: r, c0: c, c1: c };
      setActive({ r, c });
      onSelect(range);
    }
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 248), y: Math.min(e.clientY, window.innerHeight - 300), range });
  };

  const rangeFrom = (a: { r: number; c: number }, b: { r: number; c: number }): Range => ({
    sheet,
    r0: Math.min(a.r, b.r),
    r1: Math.max(a.r, b.r),
    c0: Math.min(a.c, b.c),
    c1: Math.max(a.c, b.c),
  });

  const pick = (r: number, c: number, e: React.MouseEvent) => {
    if (startPan(e)) return;
    if (e.button !== 0) return;
    // A drag selects cells, not the text inside them. preventDefault stops the
    // browser's own text selection, so focus is moved to the grid by hand.
    e.preventDefault();
    // focusVisible: false — a mouse click must not draw the keyboard focus ring around the sheet.
    box.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    const anchor = e.shiftKey && active ? active : { r, c };
    if (!e.shiftKey) setActive({ r, c });
    drag.current = anchor;
    onSelect(rangeFrom(anchor, { r, c }));
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onCell(cellAt(r, c), { r, c }, rect);
  };

  /** Ctrl/Cmd+C: the selected range as tab-separated rows, as Excel and Sheets copy it. */
  const copySelection = (rawValues = false, range: Range | null = selection) => {
    if (!range || range.sheet !== sheet) return;
    const selection = range;
    const lines: string[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const row: string[] = [];
      for (let c = selection.c0; c <= Math.min(selection.c1, maxCol); c++) {
        const cell = cellAt(r, c);
        row.push(rawValues && cell?.v !== null && cell?.v !== undefined ? String(cell.v).replace(/[\t\n]/g, " ") : typeof cell?.v === "number" ? String(cell.v) : display(cell).replace(/[\t\n]/g, " "));
      }
      lines.push(row.join("\t"));
    }
    void navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
  };

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (editable) {
      const k = e.key.toLowerCase();
      if (mod && k === "v") {
        e.preventDefault();
        void pasteAt();
        return;
      }
      if (mod && k === "x") {
        e.preventDefault();
        copySelection();
        clearSelection();
        return;
      }
      if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (active && e.key === "F2") {
        e.preventDefault();
        startEdit(active.r, active.c);
        return;
      }
      if (active && !mod && !e.altKey && e.key.length === 1 && e.key !== " ") {
        // Typing on a cell starts editing it with that character, as in Excel.
        e.preventDefault();
        startEdit(active.r, active.c, e.key);
        return;
      }
    }
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelection();
      return;
    }
    if (mod && onZoom && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
      e.preventDefault();
      onZoom(e.key === "0" ? 0 : e.key === "-" ? -1 : 1);
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelect({ sheet, r0: 1, r1: dataRow, c0: 1, c1: dataCol });
      return;
    }
    if (mod && e.key === "`") {
      e.preventDefault();
      onToggleFormulas?.();
      return;
    }
    if (e.key === " " && active && (e.shiftKey || mod)) {
      // Shift+Space selects the row, Ctrl+Space the column, as in Excel.
      e.preventDefault();
      onSelect(e.shiftKey ? { sheet, r0: active.r, r1: active.r, c0: 1, c1: dataCol } : { sheet, r0: 1, r1: dataRow, c0: active.c, c1: active.c });
      return;
    }
    if (e.key === " " && !e.repeat) {
      e.preventDefault();
      setSpace(true);
      return;
    }
    if (!active) return;
    if (e.key === "Enter" || e.key === "Tab") {
      // Enter moves down, Tab moves right; Shift goes back.
      e.preventDefault();
      const back = e.shiftKey ? -1 : 1;
      const nx = e.key === "Enter"
        ? { r: Math.min(Math.max(1, active.r + back), Math.max(1, maxRow)), c: active.c }
        : { r: active.r, c: Math.min(Math.max(1, active.c + back), maxCol) };
      setActive(nx);
      onSelect(rangeFrom(nx, nx));
      onCell(cellAt(nx.r, nx.c), nx, null);
      reveal(nx.r, nx.c, false);
      return;
    }
    const pageRows = Math.max(1, Math.floor(((box.current?.clientHeight ?? 600) - headH) / rowH) - 1);
    const lastRow = Math.max(1, maxRow);
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageUp: [-pageRows, 0], PageDown: [pageRows, 0] };
    let target: { r: number; c: number } | null = null;
    if (e.key === "Home") target = mod ? { r: 1, c: 1 } : { r: active.r, c: 1 };
    else if (e.key === "End" && mod) target = { r: dataRow, c: dataCol };
    else if (mod && e.key in d && !e.key.startsWith("Page")) {
      // Ctrl/Cmd + arrow: to the edge of the sheet, as in Excel.
      const s = d[e.key];
      target = { r: s[0] < 0 ? 1 : s[0] > 0 ? dataRow : active.r, c: s[1] < 0 ? 1 : s[1] > 0 ? dataCol : active.c };
    }
    const step = d[e.key];
    if (!step && !target) return;
    e.preventDefault();
    const next = target ?? { r: Math.min(Math.max(1, active.r + step[0]), lastRow), c: Math.min(Math.max(1, active.c + step[1]), maxCol) };
    const anchor = e.shiftKey && selection ? { r: selection.r0 === active.r ? selection.r1 : selection.r0, c: selection.c0 === active.c ? selection.c1 : selection.c0 } : next;
    setActive(next);
    onSelect(rangeFrom(e.shiftKey ? anchor : next, next));
    onCell(cellAt(next.r, next.c), next, null);
    const el = box.current;
    if (el) {
      const y = headH + (next.r - 1) * rowH;
      if (y < el.scrollTop + headH) el.scrollTop = y - headH;
      else if (y + rowH > el.scrollTop + el.clientHeight) el.scrollTop = y + rowH - el.clientHeight;
    }
  };

  if (error && !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="size-6 text-bad" aria-hidden />
        <p className="max-w-sm text-sm text-body">{error}</p>
        <button type="button" onClick={() => void load(0)} className="rounded-ctl border border-hairline px-3 py-1.5 text-sm font-medium text-ink hover:bg-cloud">
          Try again
        </button>
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Reading {sheet}…
      </div>
    );
  }

  const totalW = left[left.length - 1];
  const rows: number[] = [];
  for (let r = first; r <= last; r++) rows.push(r);

  return (
    <div
      ref={box}
      tabIndex={0}
      role="grid"
      aria-label={`Sheet ${sheet}`}
      aria-rowcount={maxRow}
      aria-colcount={maxCol}
      onKeyDown={onKey}
      onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
      onKeyUp={(e) => e.key === " " && setSpace(false)}
      onContextMenu={onContext}
      onBlur={() => setSpace(false)}
      onMouseDown={(e) => {
        // Middle button or Space + drag on the headers or the empty area also pans.
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest("[role=columnheader],[role=rowheader]")) startPan(e);
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
      style={{ fontSize: 12.5 * zoom }}
      className={cn(
        "relative h-full select-none overflow-auto overscroll-contain bg-paper font-sans outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        (space || panning) && "[&_*]:!cursor-grab",
        panning && "[&_*]:!cursor-grabbing",
      )}
    >
      <div style={{ height: headH + maxRow * rowH, width: totalW }} className="relative">
        {/* Column letters */}
        <div className="sticky top-0 z-20" style={{ width: totalW }}>
        <div role="row" className="flex" style={{ height: headH, width: totalW }}>
          <div className="sticky left-0 z-30 border-b border-r border-hairline bg-cloud" style={{ width: numW }} />
          {widths.map((w, i) => (
            <div
              key={i}
              role="columnheader"
              onMouseDown={(e) => pickHeader("col", i + 1, e)}
              title={`Select column ${colLetter(i + 1)}`}
              className={cn(
                "cursor-col-select relative flex items-center justify-center border-b border-r border-hairline font-semibold transition-colors duration-150",
                freeze.col && i === 0 && "sticky z-20",
                colPicked(i + 1) ? "bg-diff-sel text-ink" : "bg-cloud text-muted hover:bg-surface hover:text-ink",
              )}
              style={{ width: w, fontSize: 11 * zoom, left: freeze.col && i === 0 ? numW : undefined }}
            >
              {colLetter(i + 1)}
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize column ${colLetter(i + 1)}`}
                title="Drag to resize. Double-click to reset."
                onMouseDown={(e) => startColResize(i + 1, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setColW(({ [i + 1]: _drop, ...rest }) => rest);
                }}
                className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/30"
              />
            </div>
          ))}
        </div>
        {freeze.row && maxRow > 1 ? renderRow(1, true) : null}
        </div>
        {rows.map((r) => renderRow(r, false))}
        {editing ? renderEditor(editing) : null}
        {editable && selection && selection.sheet === sheet && !editing ? (
          <>
            {fillTo ? (
              <div
                aria-hidden
                className="pointer-events-none absolute z-20 border-2 border-dashed border-accent"
                style={{
                  left: left[selection.c0 - 1],
                  top: headH + (selection.r0 - 1) * rowH,
                  width: (left[Math.max(fillTo.c, selection.c1)] ?? left[left.length - 1]) - left[selection.c0 - 1],
                  height: (Math.max(fillTo.r, selection.r1) - selection.r0 + 1) * rowH,
                }}
              />
            ) : null}
            <span
              role="button"
              tabIndex={-1}
              aria-label="Fill handle: drag down or right to copy or continue a series"
              title="Drag to fill"
              onMouseDown={startFill}
              className="absolute z-20 size-2 cursor-crosshair border border-paper bg-accent"
              style={{ left: (left[selection.c1] ?? left[left.length - 1]) - 4, top: headH + selection.r1 * rowH - 4 }}
            />
          </>
        ) : null}
      </div>
      {menu ? (
        <div
          role="menu"
          aria-label="Cell menu"
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-60 rounded-ctl border border-hairline bg-paper p-1 text-[13px] text-ink shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          {[
            { label: "Copy", keys: "Ctrl+C", run: () => copySelection(false, menu.range) },
            { label: "Copy values only", keys: "", run: () => copySelection(true, menu.range) },
            null,
            { label: "Select row", keys: "Shift+Space", run: () => onSelect({ sheet, r0: menu.range.r0, r1: menu.range.r1, c0: 1, c1: dataCol }) },
            { label: "Select column", keys: "Ctrl+Space", run: () => onSelect({ sheet, r0: 1, r1: dataRow, c0: menu.range.c0, c1: menu.range.c1 }) },
            null,
            ...(onAsk
              ? [
                  { label: "Ask Sage about this range", keys: "", run: () => onAsk(menu.range, "ask") },
                  { label: "Point Sage at this range", keys: "", run: () => onAsk(menu.range, "point") },
                ]
              : []),
          ].map((it, k) =>
            it ? (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => {
                  it.run();
                  setMenu(null);
                  box.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-cloud focus-visible:bg-cloud focus-visible:outline-none"
              >
                {it.label}
                {it.keys ? <span className="text-[11.5px] text-muted">{it.keys}</span> : null}
              </button>
            ) : (
              <hr key={k} className="my-1 border-hairline" />
            ),
          )}
        </div>
      ) : null}
    </div>
  );

  function renderEditor(ed: { r: number; c: number; text: string }) {
    const x = left[ed.c - 1] ?? numW;
    const w = Math.max(widths[ed.c - 1] ?? 120, 200);
    const y = headH + (ed.r - 1) * rowH;
    const sg = suggest(ed.text);
    const hn = sg.names.length ? null : hint(ed.text);
    const pick = (name: string) => {
      setEditing({ ...ed, text: ed.text.slice(0, ed.text.length - sg.word.length) + name + "(" });
      setSug(0);
      editInput.current?.focus();
    };
    return (
      <div className="absolute z-30" style={{ left: x, top: y, width: w }}>
        <input
          ref={editInput}
          value={ed.text}
          spellCheck={false}
          aria-label={`Edit ${colLetter(ed.c)}${ed.r}`}
          onChange={(e) => {
            setEditing({ ...ed, text: e.target.value });
            setSug(0);
          }}
          onBlur={() => editingRef.current && finishEdit(true, null)}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (sg.names.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setSug((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + sg.names.length) % sg.names.length);
            } else if (sg.names.length && e.key === "Tab") {
              e.preventDefault();
              pick(sg.names[sug] ?? sg.names[0]);
            } else if (e.key === "Enter") {
              e.preventDefault();
              finishEdit(true, [e.shiftKey ? -1 : 1, 0]);
            } else if (e.key === "Tab") {
              e.preventDefault();
              finishEdit(true, [0, e.shiftKey ? -1 : 1]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              finishEdit(false, null);
            }
          }}
          className="w-full cursor-text select-text border-2 border-accent bg-paper px-2 text-ink shadow-md outline-none"
          style={{ height: rowH, fontSize: 12.5 * zoom }}
        />
        {sg.names.length ? (
          <ul role="listbox" aria-label="Functions" className="mt-0.5 w-72 rounded-ctl border border-hairline bg-paper p-1 text-[12.5px] shadow-lg">
            {sg.names.map((n, i) => (
              <li key={n} role="option" aria-selected={i === sug}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(n);
                  }}
                  className={cn("flex w-full flex-col items-start rounded px-2 py-1 text-left", i === sug ? "bg-cloud" : "hover:bg-cloud")}
                >
                  <span className="font-mono font-semibold text-ink">{n}</span>
                  <span className="truncate font-mono text-[11px] text-muted">{FUNCS[n]}</span>
                </button>
              </li>
            ))}
            <li className="px-2 pt-1 text-[11px] text-muted">Tab to insert</li>
          </ul>
        ) : hn ? (
          <div className="mt-0.5 inline-block rounded-ctl border border-hairline bg-paper px-2 py-1 font-mono text-[11.5px] text-body shadow-md">{hn}</div>
        ) : null}
      </div>
    );
  }

  function renderRow(r: number, frozen: boolean) {
          const loaded = blocks.has(Math.floor((r - 1) / BLOCK));
          const page = cellAt(r, 1)?.page ?? null;
          return (
            <div
              key={frozen ? "frozen" : r}
              role="row"
              aria-rowindex={r}
              aria-hidden={!frozen && freeze.row && r === 1 ? true : undefined}
              className={cn(frozen ? "relative flex shadow-[0_1px_0_var(--color-line-strong)]" : "absolute flex")}
              style={{ top: frozen ? undefined : headH + (r - 1) * rowH, height: rowH, width: totalW }}
            >
              <div
                role="rowheader"
                onMouseDown={(e) => pickHeader("row", r, e)}
                className={cn(
                  "cursor-row-select sticky left-0 z-10 flex items-center justify-end gap-1 border-b border-r border-hairline pr-2 tabular-nums transition-colors duration-150",
                  rowPicked(r) ? "bg-diff-sel text-ink" : "bg-cloud text-muted hover:bg-surface hover:text-ink",
                )}
                style={{ width: numW, fontSize: 11 * zoom }}
                title={page ? `From page ${page} of the PDF` : undefined}
              >
                {page ? <span className="text-[9.5px] text-faint">p{page}</span> : null}
                {r}
              </div>
              {widths.map((w, i) => {
                const c = i + 1;
                const cell = loaded ? cellAt(r, c) : null;
                const sel = selection && selection.sheet === sheet && inRange(selection, r, c);
                const hi = highlights.some((h) => h.sheet === sheet && inRange(h, r, c));
                const isActive = active?.r === r && active?.c === c;
                const pend = cell?.pending?.kind;
                const num = typeof cell?.v === "number";
                return (
                  <div
                    key={c}
                    role="gridcell"
                    aria-selected={Boolean(sel)}
                    aria-colindex={c}
                    data-r={r}
                    data-c={c}
                    onMouseDown={(e) => pick(r, c, e)}
                    onMouseEnter={() => drag.current && onSelect(rangeFrom(drag.current, { r, c }))}
                    onDoubleClick={(e) => (editable ? startEdit(r, c) : onCell(cell, { r, c }, (e.currentTarget as HTMLElement).getBoundingClientRect()))}
                    className={cn(
                      "relative cursor-cell truncate border-b border-r border-hairline px-2 text-ink",
                      (frozen || (freeze.col && c === 1)) && "bg-paper",
                      freeze.col && c === 1 && "sticky z-[5]",
                      num && "text-right tabular-nums",
                      r === 1 && !num && "font-semibold",
                      pend === "new" && "bg-diff-new shadow-[inset_3px_0_0_var(--color-diff-new-line)]",
                      pend === "changed" && "bg-diff-chg shadow-[inset_3px_0_0_var(--color-diff-chg-line)]",
                      sel && "bg-diff-sel",
                      hi && "outline outline-1 -outline-offset-1 outline-diff-sel-line",
                      isActive && "outline outline-2 -outline-offset-2 outline-diff-sel-line",
                      cell?.f && !pend && "text-ink",
                    )}
                    style={{ width: w, lineHeight: `${rowH - 1}px`, left: freeze.col && c === 1 ? numW : undefined }}
                    title={cell?.f ?? undefined}
                  >
                    {optimistic.has(`${r}:${c}`) ? (
                      <span className="text-muted">{optimistic.get(`${r}:${c}`)}</span>
                    ) : loaded ? (
                      showFormulas && cell?.f ? cell.f : display(cell)
                    ) : (
                      <span className="inline-block h-2.5 w-2/3 bg-cloud align-middle" />
                    )}
                  </div>
                );
              })}
            </div>
          );
  }
}

export function display(cell: WbCell | null): string {
  if (!cell || cell.v === null || cell.v === undefined) return cell?.f ? "" : "";
  const v = cell.v;
  if (typeof v === "number") {
    const nf = cell.nf && cell.nf !== "General" ? cell.nf : "";
    const m = /\.(0+)/.exec(nf);
    if (nf.includes("%")) {
      const pdp = m ? m[1].length : 0;
      return `${(v * 100).toLocaleString("en-NG", { minimumFractionDigits: pdp, maximumFractionDigits: pdp })}%`;
    }
    const dp = nf ? (m ? m[1].length : 0) : Number.isInteger(v) ? 0 : 2;
    const out = v.toLocaleString("en-NG", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return nf.includes("₦") ? `₦${out}` : out;
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T00:00:00$/.test(s) ? s.slice(0, 10) : s;
}
