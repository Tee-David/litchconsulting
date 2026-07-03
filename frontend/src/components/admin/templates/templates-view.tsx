"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Download, Eye, FileText, FileSpreadsheet, Receipt, Calculator,
  BookOpen, LineChart, Sparkles, type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { cn } from "@/lib/utils";

type Section = { heading: string; content: string };
type Template = {
  id: string; title: string; desc: string; category: string;
  fileType: "DOCX" | "XLSX" | "PDF"; icon: LucideIcon; color: string;
  badge?: "Popular" | "New"; sections?: Section[];
};

const TEMPLATES: Template[] = [
  { id: "invoice", title: "Professional Invoice", desc: "Branded invoice with line items, tax, totals and payment details.", category: "Invoicing", fileType: "PDF", icon: FileText, color: "#0a196d", badge: "Popular",
    sections: [{ heading: "Header", content: "Issuer details, invoice number, issue & due dates, project." }, { heading: "Bill to", content: "Client company, contact, address and tax ID." }, { heading: "Line items", content: "Description, quantity, unit price, tax %, amount." }, { heading: "Totals & payment", content: "Subtotal, tax, total due, bank details and a Pay button." }] },
  { id: "quote", title: "Quote / Estimate", desc: "Send a branded quote clients can accept — convert to an invoice later.", category: "Invoicing", fileType: "PDF", icon: FileText, color: "#2540c4",
    sections: [{ heading: "Scope", content: "Itemised scope of work with rates." }, { heading: "Validity", content: "Quote number, valid-until date, terms." }] },
  { id: "receipt", title: "Payment Receipt", desc: "Issue a receipt when an invoice is paid, with a PAID confirmation.", category: "Receipts", fileType: "PDF", icon: Receipt, color: "#16a34a", badge: "Popular",
    sections: [{ heading: "Receipt details", content: "Receipt number, paid date, method." }, { heading: "Summary", content: "Amount paid, invoice reference, PAID stamp." }] },
  { id: "pnl", title: "Profit & Loss Statement", desc: "Monthly P&L with revenue, cost of sales, expenses and net profit.", category: "Accounting", fileType: "XLSX", icon: BookOpen, color: "#f5a524",
    sections: [{ heading: "Revenue", content: "Sales, other income by category." }, { heading: "Expenses", content: "COGS, operating expenses, depreciation." }, { heading: "Result", content: "Gross profit, operating profit, net profit." }] },
  { id: "cashflow", title: "Cash Flow Statement", desc: "Track operating, investing and financing cash movements.", category: "Accounting", fileType: "XLSX", icon: LineChart, color: "#06b6d4",
    sections: [{ heading: "Operating", content: "Receipts from customers, payments to suppliers/staff." }, { heading: "Investing & financing", content: "Assets, loans, equity movements." }] },
  { id: "balance", title: "Balance Sheet", desc: "Assets, liabilities and equity snapshot at period end.", category: "Accounting", fileType: "XLSX", icon: FileSpreadsheet, color: "#a855f7",
    sections: [{ heading: "Assets", content: "Current and non-current assets." }, { heading: "Liabilities & equity", content: "Payables, loans, retained earnings." }] },
  { id: "budget", title: "Budget Planner", desc: "Plan income and expenses with variance tracking.", category: "Calculators", fileType: "XLSX", icon: Calculator, color: "#0ea5e9", badge: "New",
    sections: [{ heading: "Budget vs actual", content: "Category-level budget, actual, variance and %." }] },
  { id: "vat", title: "VAT / Tax Calculator", desc: "Compute VAT, WHT and CIT with Nigerian rates built in.", category: "Calculators", fileType: "XLSX", icon: Calculator, color: "#e5484d",
    sections: [{ heading: "Inputs", content: "Amount, rate, inclusive/exclusive toggle." }, { heading: "Output", content: "Tax due, net and gross." }] },
  { id: "loan", title: "Loan Amortisation", desc: "Schedule of principal and interest over the loan term.", category: "Calculators", fileType: "XLSX", icon: Calculator, color: "#8b5cf6",
    sections: [{ heading: "Terms", content: "Principal, rate, term, start date." }, { heading: "Schedule", content: "Per-period payment, interest, principal, balance." }] },
];

const CATEGORIES = ["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

const badgeTone: Record<string, string> = {
  Popular: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  New: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
};

export function TemplatesView() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [preview, setPreview] = useState<Template | null>(null);

  const q = query.trim().toLowerCase();
  const results = TEMPLATES.filter(
    (t) => (cat === "All" || t.category === cat) && (!q || `${t.title} ${t.desc} ${t.category}`.toLowerCase().includes(q)),
  );

  const download = (t: Template) => toast.success(`Preparing "${t.title}"… (sample template)`);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-card border border-hairline bg-paper p-6 text-center sm:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
          <Sparkles className="size-3.5" /> Ready-to-use library
        </span>
        <h2 className="mx-auto mt-4 max-w-xl font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Finance templates that move work forward.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-body">
          Invoicing, receipts, accounting and calculators — preview, download and customise for your practice.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                c === cat ? "bg-brand text-white" : "border border-hairline text-body hover:bg-surface hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
          />
        </div>
      </div>

      {/* Grid */}
      {results.length === 0 ? (
        <p className="py-16 text-center text-sm text-body">No templates match your search.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((t) => (
            <div key={t.id} className="group flex min-h-[200px] flex-col rounded-card border border-hairline bg-paper p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/5">
              <div className="mb-4 flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${t.color}18`, color: t.color }}>
                  <t.icon className="size-5" />
                </span>
                <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted">{t.fileType}</span>
              </div>
              <h3 className="flex flex-wrap items-center gap-2 font-display text-[15px] font-bold text-ink">
                {t.title}
                {t.badge && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", badgeTone[t.badge])}>{t.badge}</span>}
              </h3>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-body">{t.desc}</p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-hairline pt-3.5">
                <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-body">{t.category}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPreview(t)} title="Preview" className="grid size-8 place-items-center rounded-lg border border-hairline text-body transition-colors hover:bg-surface hover:text-ink">
                    <Eye className="size-4" />
                  </button>
                  <button onClick={() => download(t)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-hover">
                    <Download className="size-3.5" /> Get
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {preview && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div className="absolute inset-0 bg-night/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreview(null)} />
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
              className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-hairline bg-paper shadow-2xl sm:max-w-lg sm:rounded-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl" style={{ backgroundColor: `${preview.color}18`, color: preview.color }}>
                    <preview.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-[15px] font-bold text-ink">{preview.title}</p>
                    <p className="text-xs text-muted">{preview.category} · {preview.fileType}</p>
                  </div>
                </div>
                <button onClick={() => setPreview(null)} className="text-muted hover:text-ink"><X className="size-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-4 rounded-xl border border-hairline bg-surface p-5">
                  {preview.sections?.map((s, i) => (
                    <div key={i}>
                      <h4 className="border-b border-hairline pb-1.5 text-[13px] font-bold text-ink">{s.heading}</h4>
                      <p className="mt-2 text-[12px] leading-relaxed text-body">{s.content}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-4">
                <button onClick={() => setPreview(null)} className="rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-surface">Close</button>
                <button onClick={() => { download(preview); setPreview(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover">
                  <Download className="size-4" /> Download
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
