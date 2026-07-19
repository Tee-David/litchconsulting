"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { Select } from "@/components/ui/select";
import type { Anomaly, CompileResult } from "@/lib/litchai/client";
import { COMPILABLE_TEMPLATES, type CompilableTemplate } from "@/lib/litchai/templates";
import { compileWorkbookAction, recompileWorkbookAction } from "@/app/admin/analyses/actions";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

const SEVERITY: Record<Anomaly["severity"], { tone: string; icon: typeof Info; label: string }> = {
  high: { tone: "text-red-600 dark:text-red-400", icon: AlertTriangle, label: "High" },
  warning: { tone: "text-amber-600 dark:text-amber-400", icon: AlertTriangle, label: "Warning" },
  info: { tone: "text-body", icon: Info, label: "Info" },
};

/**
 * Wave 2, Step 1 — the missing bridge that makes the pipeline reachable. For a
 * document with no engagement it creates one (client + period + compilable
 * template), attaches the doc, and compiles the formula-driven workbook; for one
 * that already has an engagement it recompiles. Either way it surfaces the
 * deterministic review pack (errors → anomalies → section summaries) inline, so
 * the admin sees exactly what compiled before signing off in the panel below.
 */
export function WorkbookCompiler({
  documentId,
  clientId,
  engagementId,
}: {
  documentId: number;
  clientId: string;
  engagementId: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [template, setTemplate] = useState<CompilableTemplate>("annual_report_ias1");
  const [period, setPeriod] = useState("");
  const [materiality, setMateriality] = useState("");
  const [result, setResult] = useState<CompileResult | null>(null);

  function compile() {
    start(async () => {
      const res = engagementId
        ? await recompileWorkbookAction(engagementId, documentId)
        : await compileWorkbookAction(documentId, {
            clientId,
            periodLabel: period,
            template,
            materiality: materiality ? Number(materiality) : null,
          });
      if (!res.ok || !res.result) {
        toast.error(res.error || "Compile failed");
        return;
      }
      setResult(res.result);
      if (res.result.ok) toast.success("Workbook compiled — recompute-gated, no errors.");
      else toast.error("Compiled with formula errors — see the report.");
      router.refresh();
    });
  }

  const canCompile = engagementId ? true : Boolean(clientId && period.trim());

  return (
    <div className="space-y-4 rounded-card border border-hairline bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-brand-tint text-brand">
            <FileSpreadsheet className="size-4.5" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-ink">
              {engagementId ? "Recompile workbook" : "Compile workbook"}
            </h3>
            <p className="text-xs text-muted">
              {engagementId
                ? "Rebuild the formula-driven Excel and re-run the recompute gate."
                : "Assemble the extracted figures into a formula-driven Excel deliverable."}
            </p>
          </div>
        </div>
      </div>

      {!engagementId && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">Output</label>
            <Select
              value={template}
              onChange={(v) => setTemplate(v as CompilableTemplate)}
              options={COMPILABLE_TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
              aria-label="Workbook template"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">Period</label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="FY 2025"
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">Materiality (₦, optional)</label>
            <input
              value={materiality}
              onChange={(e) => setMateriality(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="e.g. 500000"
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={compile}
          disabled={pending || !canCompile}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 keep-brand"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : engagementId ? (
            <RefreshCw className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Compiling…" : engagementId ? "Recompile" : "Compile workbook"}
        </button>
        {!engagementId && !clientId && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This document isn&apos;t linked to a client — reanalyze it from the request.
          </p>
        )}
      </div>

      {result && <CompileReport result={result} />}
    </div>
  );
}

function CompileReport({ result }: { result: CompileResult }) {
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface/50 p-3.5">
      <div
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}
      >
        {result.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {result.ok
          ? "Compiled and recompute-gated — no formula errors."
          : `Compiled with ${result.errors.length} formula error${result.errors.length === 1 ? "" : "s"}.`}
      </div>

      {result.errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-500/5 p-2.5 text-xs text-red-700 dark:text-red-300">
          {result.errors.slice(0, 12).map(([sheet, row, col, token], i) => (
            <li key={i} className="font-mono">
              {sheet}!r{row + 1}c{col + 1} → {token}
            </li>
          ))}
          {result.errors.length > 12 && <li>… {result.errors.length - 12} more</li>}
        </ul>
      )}

      {result.anomalies.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Anomalies</p>
          {result.anomalies.map((a, i) => {
            const s = SEVERITY[a.severity] ?? SEVERITY.info;
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <s.icon className={cn("mt-0.5 size-3.5 shrink-0", s.tone)} />
                <span className="text-body">
                  <span className={cn("font-semibold", s.tone)}>{s.label}:</span> {a.message}
                  {a.refs.length > 0 && (
                    <span className="text-muted"> ({a.refs.join(", ")})</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {result.summaries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Summary</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {result.summaries.slice(0, 8).map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-paper px-2.5 py-1.5 text-xs">
                <span className="truncate text-body">{s.label}</span>
                <span className="font-semibold tabular-nums text-ink">{money.format(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
