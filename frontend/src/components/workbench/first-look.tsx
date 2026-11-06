"use client";

import { AlertTriangle, CheckCircle2, Eye, Info } from "lucide-react";
import type { WbFirstLook, WbSheetProfile } from "@/lib/litchai/workbench";
import { CiteChip } from "./turn";
import { quoteSheet } from "./refs";

const ngn = (v: number) => `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KIND_LABEL: Record<string, string> = {
  duplicate: "possible duplicates",
  outlier: "unusually large amounts",
  round_amount: "large round amounts",
  weekend: "weekend postings",
  text_date: "dates typed as text",
  text_number: "numbers stored as text",
  balance_break: "running-balance breaks",
  benford: "first-digit (Benford) pattern off",
};

function span(sh: WbSheetProfile): string | null {
  const d = (sh.columns ?? []).find((c) => c.role === "date")?.date_span as { from?: string; to?: string } | undefined;
  if (!d?.from) return null;
  const f = (x: string) => new Date(`${x}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
  return `${f(d.from)} to ${f(d.to ?? d.from)}`;
}

/**
 * "Sage reads first": the deterministic first look shown when files open —
 * every sheet's shape, totals and date span, the anomaly checks, and next
 * steps. Computed by the pipeline; no model is involved.
 */
export function FirstLookCard({
  look,
  onCite,
  onSuggest,
  disabled,
}: {
  look: WbFirstLook;
  onCite: (ref: string) => void;
  onSuggest: (text: string) => void;
  disabled?: boolean;
}) {
  const sheets = look.workbooks.flatMap((w) => w.sheets.filter((s) => s.table && s.table.rows > 0).map((s) => ({ w, s })));
  const files = look.workbooks.length;
  const byKind = Object.entries(look.anomalies.by_kind ?? {}).filter(([, n]) => n > 0);
  const findings = look.anomalies.findings ?? [];
  const warnKinds = new Set(["duplicate", "outlier", "balance_break", "text_date", "text_number"]);

  return (
    <section className="rounded-card border border-hairline bg-paper" aria-label="First look">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <Eye className="size-4 text-muted" aria-hidden />
        <h3 className="text-[13px] font-semibold text-ink">
          First look · {files} file{files === 1 ? "" : "s"}, {sheets.length} table{sheets.length === 1 ? "" : "s"}
        </h3>
        <span className="ml-auto rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">Ready</span>
      </header>
      <div className="space-y-2.5 px-3 py-2.5">
        {sheets.length === 0 ? (
          <p className="text-[12.5px] text-body">No tables found yet. Ask Sage to lay one out, or add a sheet.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            {sheets.slice(0, 6).map(({ w, s }) => (
              <div key={`${w.workbook_id}:${s.sheet}`} className="rounded-ctl bg-surface px-2.5 py-2">
                <dt className="truncate text-[11px] text-muted" title={`${w.name} · ${s.sheet}`}>
                  {files > 1 ? `${w.name} · ` : ""}{s.sheet}
                </dt>
                <dd className="text-[13px] font-semibold text-ink">{s.table!.rows.toLocaleString("en-NG")} rows</dd>
                {s.totals ? (
                  <dd className="text-[11px] text-body">
                    In {ngn((s.totals as { inflow: number }).inflow)} · out {ngn((s.totals as { outflow: number }).outflow)}
                  </dd>
                ) : null}
                {span(s) ? <dd className="text-[11px] text-muted">{span(s)}</dd> : null}
              </div>
            ))}
          </dl>
        )}

        {byKind.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-good">
            <CheckCircle2 className="size-3.5" aria-hidden /> No duplicates, outliers, text dates or balance breaks found.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {byKind.map(([kind, n]) => {
              const refs = findings.filter((f) => f.kind === kind).slice(0, 3);
              const warn = warnKinds.has(kind);
              return (
                <li key={kind} className="flex items-start gap-1.5 text-[12.5px]">
                  {warn ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden /> : <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />}
                  <span className="text-body">
                    <b className="font-semibold text-ink">{n}</b> {KIND_LABEL[kind] ?? kind.replace(/_/g, " ")}
                    {refs.length ? " " : ""}
                    {refs.map((f) => <CiteChip key={f.cell} refText={qualify(f.cell)} onCite={onCite} />)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {(look.conversions ?? []).map((c) => (
          <div key={c.workbook_id} className="rounded-ctl border border-hairline bg-surface px-2.5 py-1.5 text-[12px] text-body" role="note">
            <p className="font-medium text-ink">
              {c.filename}: working copy made from {c.format.toUpperCase()}. The original file is kept unchanged.
            </p>
            {c.notes.map((n) => (
              <p key={n} className="mt-0.5">{n}</p>
            ))}
          </div>
        ))}

        {look.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {look.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onSuggest(s)}
                className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[12px] font-medium text-ink hover:border-line-strong hover:bg-cloud disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">Computed by the pipeline from every row. No model was used.</p>
      </div>
    </section>
  );
}

function qualify(cell: string) {
  const bang = cell.lastIndexOf("!");
  return bang > 0 ? `${quoteSheet(cell.slice(0, bang).replace(/^'|'$/g, ""))}!${cell.slice(bang + 1)}` : cell;
}
