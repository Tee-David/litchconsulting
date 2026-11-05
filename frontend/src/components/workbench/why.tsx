"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { WbBatch, WbCell } from "@/lib/litchai/workbench";
import { CiteChip, TOOL_LABEL } from "./turn";
import { display } from "./grid";

/**
 * "Why is this cell here?" — the tool that wrote it, the reason, the formula,
 * the source rows it was derived from, and what it replaced. Anchored to the
 * cell on wide screens, a bottom card on phones.
 */
export function WhyPopover({
  cell,
  refText,
  rect,
  batch,
  onClose,
  onCite,
}: {
  cell: WbCell | null;
  refText: string;
  rect: DOMRect | null;
  batch: WbBatch | null;
  onClose: () => void;
  onCite: (ref: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Capture phase: close first, so a click on another cell can open its own popover.
    window.addEventListener("mousedown", onDown, true);
    box.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose]);

  const p = cell?.pending ?? null;
  const wide = typeof window !== "undefined" && window.innerWidth >= 640;
  const style: React.CSSProperties | undefined =
    wide && rect
      ? {
          position: "fixed",
          top: Math.min(rect.bottom + 6, window.innerHeight - 320),
          left: Math.min(Math.max(8, rect.left), window.innerWidth - 348),
          width: 340,
        }
      : undefined;
  const value = display(cell);

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-label={`Why ${refText}`}
      style={style}
      className={
        style
          ? "z-50 rounded-card border border-hairline bg-paper p-3 shadow-xl outline-none"
          : "fixed inset-x-2 bottom-2 z-50 rounded-card border border-hairline bg-paper p-3 shadow-2xl outline-none"
      }
    >
      <div className="flex items-start gap-2">
        <p className="font-mono text-[12px] font-semibold text-ink">{refText}</p>
        {p ? (
          <span className={p.kind === "changed" ? "rounded-full bg-diff-chg px-1.5 text-[10.5px] font-medium text-warn" : "rounded-full bg-diff-new px-1.5 text-[10.5px] font-medium text-good"}>
            {p.kind === "changed" ? "Changed" : "New"} · proposed
          </span>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded p-0.5 text-muted hover:bg-cloud hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>
      <dl className="mt-2 space-y-1.5 text-[12.5px]">
        <Row label="Value">{value || <span className="text-muted">Empty</span>}</Row>
        {cell?.f ? <Row label="Formula"><code className="break-all font-mono text-[11.5px] text-ink">{cell.f}</code></Row> : null}
        {p ? (
          <>
            <Row label="Made by">{TOOL_LABEL[p.tool] ?? p.tool}{batch ? <span className="text-muted"> · {batch.title}</span> : null}</Row>
            {p.reason ? <Row label="Why">{p.reason}</Row> : null}
            {p.kind === "changed" ? (
              <Row label="Was">
                {p.old_formula ? <code className="font-mono text-[11.5px]">{p.old_formula}</code> : String(p.old_value ?? "") || <span className="text-muted">Empty</span>}
              </Row>
            ) : null}
            {p.source_rows.length ? (
              <Row label="From">
                <span className="flex flex-wrap gap-0.5">
                  {p.source_rows.slice(0, 8).map((r) => <CiteChip key={r} refText={r} onCite={onCite} />)}
                  {p.source_rows.length > 8 ? <span className="text-muted">+{p.source_rows.length - 8} more</span> : null}
                </span>
              </Row>
            ) : null}
          </>
        ) : !cell?.f ? (
          <p className="text-muted">Typed into the file. Sage did not write this cell.</p>
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
