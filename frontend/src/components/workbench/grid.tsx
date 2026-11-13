"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { WbCell, WbSheetWindow } from "@/lib/litchai/workbench";
import { colLetter, type Range, inRange } from "./refs";
import { cn } from "@/lib/utils";

const ROW_H = 28;
const HEAD_H = 28;
const ROWNUM_W = 52;
const BLOCK = 100;
const MAX_COLS = 60;

type Block = { cells: Map<string, WbCell> };
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
  const key = `${conversationId}|${workbookId}|${sheet}|${version}`;
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
    void load(0);
  }, [key, load]);

  const maxRow = meta?.maxRow ?? 0;
  const maxCol = Math.max(meta?.maxCol ?? 0, 6);
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
      w.push(Math.round(Math.max(72, Math.min(300, n * 7.4 + 22)) * zoom));
    }
    return w;
  }, [blocks, maxCol, maxRow, zoom]);

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
  useEffect(() => {
    const el = box.current;
    if (!focus || !el) return;
    const g = geom.current;
    const y = g.headH + (focus.r - 1) * g.rowH;
    const x = g.left[focus.c - 1] ?? 0;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), left: Math.max(0, x - g.numW - 40), behavior: "smooth" });
    setActive({ r: focus.r, c: focus.c });
  }, [focus]);

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
    box.current?.focus({ preventScroll: true });
    const anchor = e.shiftKey && active ? active : { r, c };
    if (!e.shiftKey) setActive({ r, c });
    drag.current = anchor;
    onSelect(rangeFrom(anchor, { r, c }));
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onCell(cellAt(r, c), { r, c }, rect);
  };

  /** Ctrl/Cmd+C: the selected range as tab-separated rows, as Excel and Sheets copy it. */
  const copySelection = () => {
    if (!selection || selection.sheet !== sheet) return;
    const lines: string[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const row: string[] = [];
      for (let c = selection.c0; c <= Math.min(selection.c1, maxCol); c++) {
        const cell = cellAt(r, c);
        row.push(typeof cell?.v === "number" ? String(cell.v) : display(cell).replace(/[\t\n]/g, " "));
      }
      lines.push(row.join("\t"));
    }
    void navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
  };

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
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
    if (e.key === " " && !e.repeat) {
      e.preventDefault();
      setSpace(true);
      return;
    }
    if (!active) return;
    const pageRows = Math.max(1, Math.floor(((box.current?.clientHeight ?? 600) - headH) / rowH) - 1);
    const lastRow = Math.max(1, maxRow);
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageUp: [-pageRows, 0], PageDown: [pageRows, 0] };
    let target: { r: number; c: number } | null = null;
    if (e.key === "Home") target = mod ? { r: 1, c: 1 } : { r: active.r, c: 1 };
    else if (e.key === "End" && mod) target = { r: lastRow, c: maxCol };
    else if (mod && e.key in d && !e.key.startsWith("Page")) {
      // Ctrl/Cmd + arrow: to the edge of the sheet, as in Excel.
      const s = d[e.key];
      target = { r: s[0] < 0 ? 1 : s[0] > 0 ? lastRow : active.r, c: s[1] < 0 ? 1 : s[1] > 0 ? maxCol : active.c };
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
        <div role="row" className="sticky top-0 z-20 flex" style={{ height: headH, width: totalW }}>
          <div className="sticky left-0 z-30 border-b border-r border-hairline bg-cloud" style={{ width: numW }} />
          {widths.map((w, i) => (
            <div
              key={i}
              role="columnheader"
              className="flex items-center justify-center border-b border-r border-hairline bg-cloud font-semibold text-muted"
              style={{ width: w, fontSize: 11 * zoom }}
            >
              {colLetter(i + 1)}
            </div>
          ))}
        </div>
        {rows.map((r) => {
          const loaded = blocks.has(Math.floor((r - 1) / BLOCK));
          const page = cellAt(r, 1)?.page ?? null;
          return (
            <div key={r} role="row" aria-rowindex={r} className="absolute flex" style={{ top: headH + (r - 1) * rowH, height: rowH, width: totalW }}>
              <div
                role="rowheader"
                className="sticky left-0 z-10 flex items-center justify-end gap-1 border-b border-r border-hairline bg-cloud pr-2 tabular-nums text-muted"
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
                    onMouseDown={(e) => pick(r, c, e)}
                    onMouseEnter={() => drag.current && onSelect(rangeFrom(drag.current, { r, c }))}
                    onDoubleClick={(e) => onCell(cell, { r, c }, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                    className={cn(
                      "relative cursor-cell truncate border-b border-r border-hairline px-2 text-ink",
                      num && "text-right tabular-nums",
                      r === 1 && !num && "font-semibold",
                      pend === "new" && "bg-diff-new shadow-[inset_3px_0_0_var(--color-diff-new-line)]",
                      pend === "changed" && "bg-diff-chg shadow-[inset_3px_0_0_var(--color-diff-chg-line)]",
                      sel && "bg-diff-sel",
                      hi && "outline outline-1 -outline-offset-1 outline-diff-sel-line",
                      isActive && "outline outline-2 -outline-offset-2 outline-diff-sel-line",
                      cell?.f && !pend && "text-ink",
                    )}
                    style={{ width: w, lineHeight: `${rowH - 1}px` }}
                    title={cell?.f ?? undefined}
                  >
                    {loaded ? display(cell) : <span className="inline-block h-2.5 w-2/3 animate-pulse rounded bg-cloud align-middle" />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function display(cell: WbCell | null): string {
  if (!cell || cell.v === null || cell.v === undefined) return cell?.f ? "" : "";
  const v = cell.v;
  if (typeof v === "number") {
    const pct = cell.nf?.includes("%");
    if (pct) return `${(v * 100).toLocaleString("en-NG", { maximumFractionDigits: 1 })}%`;
    const dp = cell.nf && /0\.0+/.test(cell.nf) ? 2 : Number.isInteger(v) ? 0 : 2;
    return v.toLocaleString("en-NG", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T00:00:00$/.test(s) ? s.slice(0, 10) : s;
}
