"use client";

import { AlertTriangle, Check, Layers, Loader2, Pencil, ShieldAlert, Undo2 } from "lucide-react";
import type { WbBatch } from "@/lib/litchai/workbench";
import { Button } from "@/components/kit";
import { cn } from "@/lib/utils";

export function batchLine(b: WbBatch): string {
  const c = b.counts;
  const bits: string[] = [];
  if (c.new_cells) bits.push(`${c.new_cells.toLocaleString("en-NG")} new cell${c.new_cells === 1 ? "" : "s"}`);
  if (c.changed_cells) bits.push(`${c.changed_cells.toLocaleString("en-NG")} changed`);
  if (c.new_sheets) bits.push(`${c.new_sheets} new sheet${c.new_sheets === 1 ? "" : "s"}`);
  if (c.charts) bits.push(`${c.charts} chart${c.charts === 1 ? "" : "s"}`);
  if (!c.changed_cells && (c.new_cells || c.new_sheets)) bits.push("nothing overwritten");
  return bits.join(" · ");
}

/** The first cell a batch touches (for Edit / jump). */
export function firstRef(b: WbBatch): string | null {
  const op = b.ops.find((o) => o.op === "set_cell" && o.sheet && o.cell);
  return op ? `${/^[A-Za-z_][\w.]*$/.test(op.sheet!) ? op.sheet : `'${op.sheet}'`}!${op.cell}` : null;
}

export function Proposals({
  batches,
  busy,
  onDecide,
  onEdit,
  onJump,
}: {
  batches: WbBatch[];
  busy: string | null;
  onDecide: (b: WbBatch | "all", action: "accept" | "reject" | "undo") => void;
  onEdit: (b: WbBatch) => void;
  onJump: (ref: string) => void;
}) {
  const own = batches.filter((b) => !b.inverse_of);
  const open = own.filter((b) => b.status === "pending" || b.status === "blocked");
  const recent = own.filter((b) => b.status === "accepted" || b.status === "rejected" || b.status === "undone").slice(-5).reverse();
  if (!open.length && !recent.length) return null;
  const pending = open.filter((b) => b.status === "pending");

  return (
    <section className="rounded-card border border-hairline bg-paper" aria-label="Proposed changes">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <Layers className="size-4 text-muted" aria-hidden />
        <h3 className="text-[13px] font-semibold text-ink">Proposed changes</h3>
        <span className="ml-auto text-[12px] text-muted">{pending.length ? `${pending.length} waiting` : "All decided"}</span>
      </header>
      <ul className="divide-y divide-hairline">
        {[...open, ...recent].map((b) => {
          const ref = firstRef(b);
          const isBusy = busy === b.id;
          const kind = b.counts.changed_cells ? "changed" : "new";
          return (
            <li key={b.id} className={cn("px-3 py-2.5", b.status !== "pending" && b.status !== "blocked" && "opacity-80")}>
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn("mt-1 size-3 shrink-0 rounded-sm border", kind === "changed" ? "border-diff-chg-line bg-diff-chg" : "border-diff-new-line bg-diff-new")}
                />
                <div className="min-w-0 flex-1">
                  <button type="button" className="text-left text-[13px] font-semibold text-ink hover:underline" onClick={() => ref && onJump(ref)} disabled={!ref}>
                    {b.title}
                  </button>
                  <p className="text-[12px] text-muted">{batchLine(b) || b.summary}</p>
                  {b.risk === "risky" ? (
                    <p className="mt-1 flex items-start gap-1 text-[12px] text-warn">
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Review closely: {(b.risk_reasons ?? []).join("; ") || "overwrites existing values"}.
                    </p>
                  ) : null}
                  {b.status === "blocked" ? (
                    <div className="mt-1.5 rounded-ctl border border-bad/30 bg-bad-soft px-2 py-1.5 text-[12px] text-ink" role="alert">
                      <p className="flex items-center gap-1 font-semibold">
                        <AlertTriangle className="size-3.5 text-bad" aria-hidden />
                        {b.gate?.status === "conflict" ? "Cells changed since this was proposed" : "The recompute found formula errors"}
                      </p>
                      <ul className="mt-0.5 list-inside list-disc text-body">
                        {(b.gate?.errors ?? []).slice(0, 4).map((e, i) => <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>)}
                      </ul>
                      <p className="mt-0.5 text-muted">The previous version is kept. Edit the cells, or ask Sage for a fresh proposal.</p>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {b.status === "pending" || b.status === "blocked" ? (
                      <>
                        <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => onDecide(b, "accept")}>
                          {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {b.status === "blocked" ? "Try again" : "Accept"}
                        </Button>
                        {b.ops.some((o) => o.op === "set_cell") ? (
                          <Button size="sm" disabled={Boolean(busy)} onClick={() => onEdit(b)}>
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => onDecide(b, "reject")}>
                          Reject
                        </Button>
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            b.status === "accepted" ? "bg-good-soft text-good" : "bg-cloud text-muted",
                          )}
                        >
                          {b.status === "accepted" ? "Accepted" : b.status === "undone" ? "Undone" : "Rejected"}
                          {b.status === "accepted" && b.gate?.status === "unverified" ? " · not recomputed" : ""}
                        </span>
                        {b.status === "accepted" ? (
                          <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => onDecide(b, "undo")}>
                            {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Undo
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {pending.length > 1 ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2.5">
          <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => onDecide("all", "accept")}>
            Accept all {pending.length}
          </Button>
          <Button size="sm" disabled={Boolean(busy)} onClick={() => onDecide("all", "reject")}>
            Reject all
          </Button>
        </footer>
      ) : null}
      <p className="border-t border-hairline px-3 py-2 text-[11.5px] text-muted">Nothing in the file changes until you accept. Each batch undoes on its own.</p>
    </section>
  );
}
