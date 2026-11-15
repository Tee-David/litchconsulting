"use client";

import { AlertTriangle, CheckCircle2, Eye, FileStack, FileText, Info, ListChecks } from "lucide-react";
import { Trace } from "@/components/sage-ui/trace";
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

  const notesBy = new Map((look.conversions ?? []).map((c) => [c.workbook_id, c]));
  const tables = sheets.length;
  const checks = byKind.map(([kind, n]) => ({ kind, n, refs: findings.filter((f) => f.kind === kind).slice(0, 3), warn: warnKinds.has(kind) }));
  // The most serious first: warnings, then the larger counts.
  checks.sort((a, b) => Number(b.warn) - Number(a.warn) || b.n - a.n);
  const top = checks.slice(0, 3);
  const rest = checks.slice(3);
  const Check1 = ({ c }: { c: (typeof checks)[number] }) => (
    <li className="flex items-start gap-2 text-[12.5px]">
      {c.warn ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden /> : <Info className="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden />}
      <span className="min-w-0 text-body">
        <b className="font-semibold text-ink">{c.n.toLocaleString("en-NG")}</b> {KIND_LABEL[c.kind] ?? c.kind.replace(/_/g, " ")}
        {c.refs.length ? " " : ""}
        {c.refs.map((f) => <CiteChip key={f.cell} refText={qualify(f.cell)} onCite={onCite} />)}
      </span>
    </li>
  );

  return (
    <section className="space-y-2 rounded-card border border-hairline bg-paper px-3 py-2.5" aria-label="First look">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Eye className="size-4 text-muted" aria-hidden /> First look
        <span className="font-normal text-muted">
          · {files} file{files === 1 ? "" : "s"}, {tables} table{tables === 1 ? "" : "s"}
        </span>
      </p>

      {/* Task: every file read, one row each; a working-copy note sits in its row. */}
      <Trace size="sm" icon={<FileStack />} status="none" title={`Read ${files} file${files === 1 ? "" : "s"}${notesBy.size ? ` · ${notesBy.size} working cop${notesBy.size === 1 ? "y" : "ies"}` : ""}`}>
        <ul className="space-y-1.5 pt-1">
          {look.workbooks.map((w) => {
            const conv = notesBy.get(w.workbook_id);
            const tabs = w.sheets.filter((sh) => sh.table && sh.table.rows > 0);
            return (
              <li key={w.workbook_id} className="rounded-lg bg-surface px-2.5 py-2 text-[12px]">
                <p className="flex items-center gap-1.5 font-medium text-ink">
                  <FileText className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 truncate" title={conv?.filename ?? w.name}>{conv?.filename ?? w.name}</span>
                  {conv ? <span className="ml-auto shrink-0 rounded bg-paper px-1.5 text-[10.5px] font-semibold uppercase text-muted">{conv.format}</span> : null}
                </p>
                {tabs.map((sh) => (
                  <p key={sh.sheet} className="mt-0.5 text-body">
                    {sh.sheet}: {sh.table!.rows.toLocaleString("en-NG")} rows
                    {sh.totals ? ` · in ${ngn((sh.totals as { inflow: number }).inflow)}, out ${ngn((sh.totals as { outflow: number }).outflow)}` : ""}
                    {span(sh) ? ` · ${span(sh)}` : ""}
                  </p>
                ))}
                {conv ? <p className="mt-0.5 text-muted">Working copy; the original is kept. {conv.notes.join(" ")}</p> : null}
              </li>
            );
          })}
        </ul>
      </Trace>

      {checks.length === 0 ? (
        <p className="flex min-h-8 items-center gap-2 text-[12.5px] text-good">
          <CheckCircle2 className="size-3.5" aria-hidden /> No duplicates, outliers, text dates or balance breaks found.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {top.map((c) => <Check1 key={c.kind} c={c} />)}
          </ul>
          {rest.length ? (
            <Trace size="sm" status="none" icon={<ListChecks />} title={`${rest.length} more check${rest.length === 1 ? "" : "s"}`}>
              <ul className="space-y-1.5 pt-1">
                {rest.map((c) => <Check1 key={c.kind} c={c} />)}
              </ul>
            </Trace>
          ) : null}
        </>
      )}

      {look.suggestions.length > 0 && (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [mask-image:linear-gradient(90deg,transparent,#000_12px,#000_calc(100%-12px),transparent)] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:[mask-image:none]">
          {look.suggestions.map((sg) => (
            <button
              key={sg}
              type="button"
              disabled={disabled}
              onClick={() => onSuggest(sg)}
              className="min-h-9 shrink-0 rounded-full border border-hairline bg-surface px-3 text-[12px] font-medium text-ink hover:border-line-strong hover:bg-cloud disabled:opacity-50"
            >
              {sg}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted">Computed by the pipeline from every row. No model was used.</p>
    </section>
  );
}

function qualify(cell: string) {
  const bang = cell.lastIndexOf("!");
  return bang > 0 ? `${quoteSheet(cell.slice(0, bang).replace(/^'|'$/g, ""))}!${cell.slice(bang + 1)}` : cell;
}
