"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, Info, ListChecks, X } from "lucide-react";
import { DataTable, EmptyState, type TableView } from "@/components/kit";
import { Panel } from "@/components/admin/ui/surface";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { recategorize } from "@/app/admin/analyses/actions";
import type { InsightFinding, LineItem, TaxonomyCategory } from "@/lib/litchai/client";
import { cn } from "@/lib/utils";

const SEVERITY: Record<InsightFinding["severity"], { icon: typeof Info; tile: string; label: string }> = {
  high: { icon: AlertTriangle, tile: "bg-bad-soft text-bad", label: "Look first" },
  medium: { icon: AlertTriangle, tile: "bg-warn-soft text-warn", label: "Check" },
  low: { icon: Info, tile: "bg-info-soft text-info", label: "Note" },
};

/** How sure the AI is, in words. */
function sureness(li: LineItem): { label: string; tone: string } {
  if (li.category_source === "human") return { label: "Set by a person", tone: "text-good" };
  if (li.needs_review || !li.category_code || li.category_code.startsWith("suspense")) return { label: "Not sure", tone: "text-warn" };
  if ((li.confidence ?? 0) >= 0.9) return { label: "Sure", tone: "text-good" };
  return { label: "Check", tone: "text-body" };
}
const SOURCE: Record<string, string> = { human: "A person", llm: "AI model", exact: "Firm memory", memory: "Firm memory", fuzzy: "Firm memory", vector: "Similar lines", rules: "Rules", keyword: "Rules" };

/**
 * The findings and the lines of one Analysis result. A finding card filters
 * the lines to the ones it is about; the lines start on "Needs review".
 */
export function AnalysisBody({
  documentId,
  findings,
  lines,
  categories,
  currency,
}: {
  documentId: number;
  findings: InsightFinding[];
  lines: LineItem[];
  categories: TaxonomyCategory[];
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [focus, setFocus] = useState<InsightFinding | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const label = useMemo(() => new Map(categories.map((c) => [c.code, c.label])), [categories]);
  const why = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const f of findings) for (const id of f.line_ids) m.set(id, [...(m.get(id) ?? []), f.title]);
    return m;
  }, [findings]);
  const shown = useMemo(() => (focus ? lines.filter((l) => focus.line_ids.includes(l.id)) : lines), [focus, lines]);

  const setCategory = (li: LineItem, code: string) => {
    if (!code || code === li.category_code) return;
    setSavingId(li.id);
    startTransition(async () => {
      const r = await recategorize(documentId, li.id, code);
      setSavingId(null);
      if (!r.ok) return void toast.error(r.error || "The category was not saved.");
      toast.success("Saved. The AI learns from this for this client.");
      router.refresh();
    });
  };

  const columns = useMemo<ColumnDef<LineItem, unknown>[]>(
    () => [
      {
        id: "narration",
        accessorKey: "raw_text",
        header: "Line",
        meta: { label: "Line", mobile: "title", hideable: false },
        cell: ({ row: { original: li } }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{li.raw_text}</span>
            <span className="block truncate text-xs text-muted">{li.sheet_ref ?? (li.page_ref ? `Page ${li.page_ref}` : "")}</span>
          </span>
        ),
      },
      {
        id: "amount",
        accessorFn: (li) => (li.direction === "out" ? -li.amount : li.amount),
        header: "Amount",
        meta: { label: "Amount", align: "right", mobile: "badge" },
        cell: ({ row: { original: li } }) => (
          <span className={cn("whitespace-nowrap tabular-nums font-medium", li.direction === "out" ? "text-ink" : "text-good")}>
            {li.direction === "out" ? "−" : ""}
            {formatMoney(li.amount, currency)}
          </span>
        ),
      },
      {
        id: "category",
        accessorFn: (li) => label.get(li.category_code ?? "") ?? "",
        header: "Category",
        meta: { label: "Category", mobile: "meta" },
        cell: ({ row: { original: li } }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              aria-label={`Category for ${li.raw_text}`}
              value={li.category_code ?? ""}
              disabled={savingId === li.id}
              onChange={(v) => setCategory(li, v)}
              placeholder="Not categorised"
              searchable
              options={categories.map((c) => ({ value: c.code, label: c.label }))}
              className="min-w-[13rem] max-w-[16rem]"
            />
          </div>
        ),
      },
      {
        id: "sure",
        accessorFn: (li) => sureness(li).label,
        header: "How sure",
        meta: { label: "How sure", mobile: "meta" },
        cell: ({ row: { original: li } }) => {
          const s = sureness(li);
          return (
            <span className="block">
              <span className={cn("block text-sm font-medium", s.tone)}>{s.label}</span>
              <span className="block text-xs text-muted">{SOURCE[li.category_source ?? ""] ?? "Rules"}</span>
            </span>
          );
        },
      },
      {
        id: "why",
        accessorFn: (li) => [...(why.get(li.id) ?? []), ...li.flags].join(" "),
        header: "Why flagged",
        meta: { label: "Why flagged", mobile: "meta" },
        cell: ({ row: { original: li } }) => {
          const w = [...(why.get(li.id) ?? []), ...li.flags.map((f) => f.replace(/_/g, " "))];
          return w.length ? <span className="text-xs text-warn">{w.join(" · ")}</span> : <span className="text-muted">—</span>;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [label, why, savingId, categories, currency],
  );

  const views: TableView<LineItem>[] = [
    { id: "review", label: "Needs review", predicate: (li) => sureness(li).label === "Not sure" || li.flags.length > 0 || why.has(li.id) },
    { id: "all", label: "All lines", predicate: () => true },
    { id: "human", label: "Changed by people", predicate: (li) => li.category_source === "human" },
  ];
  return (
    <div className="space-y-5">
      <Panel title="What we found" sub={findings.length ? `${findings.length} ${findings.length === 1 ? "finding" : "findings"}, most important first` : undefined}>
        {findings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-body">
            <CheckCircle2 className="size-4 text-good" aria-hidden /> Nothing unusual was found in this file.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {findings.map((f) => {
              const s = SEVERITY[f.severity];
              const on = focus?.id === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setFocus(on ? null : f)}
                    aria-pressed={on}
                    className={cn(
                      "flex h-full w-full items-start gap-3 rounded-card border p-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                      on ? "border-accent bg-brand-tint" : "border-hairline hover:bg-surface",
                    )}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-ctl", s.tile)}>
                      <s.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{f.title}</span>
                      <span className="mt-0.5 block text-[13px] text-body">{f.why}</span>
                      <span className="mt-1.5 block text-xs text-muted">
                        {s.label}
                        {f.amount != null ? ` · ${formatMoney(f.amount, currency)}` : ""}
                        {f.line_ids.length ? ` · ${f.line_ids.length} ${f.line_ids.length === 1 ? "line" : "lines"}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <section id="lines" aria-labelledby="lines-title">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="lines-title" className="font-display text-[15px] font-semibold text-ink">Lines</h2>
          {focus ? (
            <button type="button" onClick={() => setFocus(null)} className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-brand-tint px-3 text-xs font-medium text-ink">
              Showing: {focus.title} <X className="size-3.5" aria-label="Show all lines" />
            </button>
          ) : null}
        </div>
        <DataTable
          label="Lines"
          storageKey={`analysis-lines`}
          columns={columns}
          data={shown}
          getRowId={(li) => String(li.id)}
          views={focus ? undefined : views}
          searchPlaceholder="Search the lines"
          searchText={(li) => `${li.raw_text} ${label.get(li.category_code ?? "") ?? ""}`}
          emptyState={<EmptyState icon={<ListChecks />} title="No lines yet" why="The lines appear when the AI has read the file." />}
        />
      </section>
    </div>
  );
}
