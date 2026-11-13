"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronUp, Copy, Eye, EyeOff, Palette, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SheetInfo = { name: string; color: string | null; hidden: boolean };
export type SheetActionKind = "rename" | "move" | "copy" | "delete" | "color" | "hide" | "unhide";

/** Tab colours: the semantic and brand hues from the Litch tokens, plus "none". */
const COLORS = ["2540C4", "1F9D5C", "C98500", "B42318", "4A5263"];

/**
 * S2: the sheet tabs with a menu per tab (rename, duplicate, move, colour, hide,
 * delete) and drag to reorder. Every action is saved at once as a version, so the
 * toolbar's Undo (Ctrl+Z) reverses it.
 */
export function SheetTabs({
  sheets,
  info,
  active,
  isNew,
  busy,
  onPick,
  onAction,
}: {
  /** Every sheet, in workbook order (hidden ones included). */
  sheets: string[];
  info: Record<string, SheetInfo>;
  active: string;
  isNew: (name: string) => boolean;
  busy: boolean;
  onPick: (name: string) => void;
  onAction: (sheet: string, action: SheetActionKind, extra?: { name?: string; index?: number; color?: string }) => Promise<boolean>;
}) {
  const [menu, setMenu] = useState<{ sheet: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const visible = sheets.filter((n) => !info[n]?.hidden);
  const hidden = sheets.filter((n) => info[n]?.hidden);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setMenu(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const run = async (sheet: string, action: SheetActionKind, extra?: { name?: string; index?: number; color?: string }) => {
    setMenu(null);
    await onAction(sheet, action, extra);
  };
  const item = "flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ink hover:bg-surface disabled:opacity-40";
  const idx = (n: string) => sheets.indexOf(n);

  return (
    <>
      {visible.map((n) => {
        const on = n === active;
        const color = info[n]?.color;
        if (renaming === n) return <RenameBox key={n} name={n} onDone={(to) => { setRenaming(null); if (to && to !== n) void onAction(n, "rename", { name: to }); }} />;
        return (
          <span
            key={n}
            draggable={!busy}
            onDragStart={(e) => {
              setDrag(n);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!drag || drag === n) return;
              e.preventDefault();
              setOver(n);
            }}
            onDragLeave={() => setOver((o) => (o === n ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const from = drag;
              setDrag(null);
              setOver(null);
              if (from && from !== n) void onAction(from, "move", { index: idx(n) });
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            className={cn(
              "group inline-flex shrink-0 items-center rounded-ctl",
              on ? "bg-paper shadow-sm" : "hover:bg-cloud",
              drag === n && "opacity-40",
              over === n && "shadow-[-2px_0_0_var(--color-accent)]",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPick(n)}
              onDoubleClick={() => setRenaming(n)}
              className={cn("inline-flex min-h-8 items-center gap-1.5 py-1 pl-2.5 pr-1 text-[12.5px]", on ? "font-semibold text-ink" : "text-body")}
              title="Click to open. Double-click to rename. Drag to move."
            >
              {color ? <i className="size-2 rounded-full" style={{ background: `#${color}` }} aria-hidden /> : null}
              {isNew(n) ? <i className="size-1.5 rounded-full bg-diff-new-line" aria-label="New" /> : null}
              {n}
            </button>
            <button
              type="button"
              aria-label={`Sheet options for ${n}`}
              aria-haspopup="menu"
              disabled={busy}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ sheet: n, x: r.left, y: r.top });
              }}
              className={cn("mr-0.5 grid size-6 place-items-center rounded-md text-faint hover:bg-surface hover:text-ink", !on && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
            >
              <ChevronUp className="size-3.5" />
            </button>
          </span>
        );
      })}
      {menu
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[80]" onMouseDown={() => setMenu(null)} aria-hidden />
              <div
                role="menu"
                aria-label={`Sheet options for ${menu.sheet}`}
                className="fixed z-[81] w-60 rounded-xl border border-hairline bg-paper p-1 shadow-lg"
                style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 248)), bottom: Math.max(8, window.innerHeight - menu.y + 6) }}
              >
                <button type="button" role="menuitem" className={item} onClick={() => { setMenu(null); setRenaming(menu.sheet); }}>
                  <Pencil className="size-4 text-muted" /> Rename
                </button>
                <button type="button" role="menuitem" className={item} onClick={() => void run(menu.sheet, "copy")}>
                  <Copy className="size-4 text-muted" /> Duplicate
                </button>
                <button type="button" role="menuitem" className={item} disabled={idx(menu.sheet) === 0} onClick={() => void run(menu.sheet, "move", { index: idx(menu.sheet) - 1 })}>
                  <ArrowLeft className="size-4 text-muted" /> Move left
                </button>
                <button type="button" role="menuitem" className={item} disabled={idx(menu.sheet) === sheets.length - 1} onClick={() => void run(menu.sheet, "move", { index: idx(menu.sheet) + 1 })}>
                  <ArrowRight className="size-4 text-muted" /> Move right
                </button>
                <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-1 text-[12px] text-muted">
                  <Palette className="size-4" /> Tab colour
                </div>
                <div className="flex gap-2 px-2.5 pb-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour #${c}`}
                      aria-pressed={info[menu.sheet]?.color === c}
                      onClick={() => void run(menu.sheet, "color", { color: c })}
                      className="size-6 rounded-full ring-1 ring-line-strong ring-offset-2 ring-offset-paper aria-pressed:ring-2 aria-pressed:ring-ink"
                      style={{ background: `#${c}` }}
                    />
                  ))}
                  <button type="button" aria-label="No colour" onClick={() => void run(menu.sheet, "color", { color: "" })} className="size-6 rounded-full bg-paper ring-1 ring-line-strong ring-offset-2 ring-offset-paper" />
                </div>
                <button type="button" role="menuitem" className={item} disabled={visible.length < 2} onClick={() => void run(menu.sheet, "hide")}>
                  <EyeOff className="size-4 text-muted" /> Hide
                </button>
                {hidden.map((h) => (
                  <button key={h} type="button" role="menuitem" className={item} onClick={() => void run(h, "unhide")}>
                    <Eye className="size-4 text-muted" /> Show {h}
                  </button>
                ))}
                <div className="my-1 border-t border-hairline" />
                <button type="button" role="menuitem" className={cn(item, "text-bad")} disabled={visible.length < 2} onClick={() => void run(menu.sheet, "delete")}>
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

function RenameBox({ name, onDone }: { name: string; onDone: (to: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (to: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(to);
  };
  return (
    <input
      ref={ref}
      defaultValue={name}
      maxLength={31}
      aria-label={`New name for ${name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value.trim() || null);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value.trim() || null)}
      className="h-8 w-36 shrink-0 rounded-ctl border border-act bg-paper px-2 text-[12.5px] text-ink outline-none ring-2 ring-act/15"
    />
  );
}
