"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search, X, Download, Eye, FileText, FileSpreadsheet, Receipt, Calculator,
  BookOpen, LineChart, Sparkles, Upload, Trash2, Link2, Loader2, UploadCloud, type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Modal } from "@/components/admin/ui/modal";
import { saveTemplateAction, deleteTemplateAction } from "@/app/admin/finance/templates/actions";
import type { TemplateRow } from "@/lib/db/queries/templates";
import { uploadFile } from "@/lib/upload-client";
import { formatBytes, extLabel } from "@/lib/files";
import { cn } from "@/lib/utils";

type Section = { heading: string; content: string };
type Curated = {
  id: string; title: string; desc: string; category: string;
  fileType: "DOCX" | "XLSX" | "PDF"; icon: LucideIcon; color: string;
  badge?: "Popular" | "New"; sections?: Section[];
};

const CURATED: Curated[] = [
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

const CATEGORY_OPTIONS = ["Invoicing", "Receipts", "Accounting", "Modelling", "Reporting", "Calculators", "Onboarding", "General"];

const badgeTone: Record<string, string> = {
  Popular: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  New: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
};

const TYPE_COLOR: Record<string, string> = {
  XLSX: "#16a34a", CSV: "#16a34a", DOCX: "#2540c4", PDF: "#e5484d", PPTX: "#f97316", ZIP: "#8a92a6",
};

const inputCls = "w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function TemplatesView({ imported = [] }: { imported?: TemplateRow[] }) {
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [preview, setPreview] = useState<Curated | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: "", description: "", category: "General", badge: "" });
  const [uploading, setUploading] = useState(false);

  const categories = ["All", ...Array.from(new Set([...imported.map((t) => t.category), ...CURATED.map((t) => t.category)]))];
  const q = query.trim().toLowerCase();

  const importedResults = imported.filter(
    (t) => (cat === "All" || t.category === cat) && (!q || `${t.title} ${t.description || ""} ${t.category}`.toLowerCase().includes(q)),
  );
  const curatedResults = CURATED.filter(
    (t) => (cat === "All" || t.category === cat) && (!q || `${t.title} ${t.desc} ${t.category}`.toLowerCase().includes(q)),
  );

  function pickFile(f: File) {
    setFile(f);
    setMeta((m) => ({ ...m, title: m.title || f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }));
  }

  async function doImport() {
    if (!file) {
      toast.error("Choose a file to import.");
      return;
    }
    if (!meta.title.trim()) {
      toast.error("Give the template a title.");
      return;
    }
    setUploading(true);
    try {
      const fileUrl = await uploadFile(file, "template");
      const res = await saveTemplateAction({
        title: meta.title,
        description: meta.description,
        category: meta.category,
        badge: meta.badge || undefined,
        fileType: extLabel(file.name),
        fileUrl,
        sizeBytes: file.size,
      });
      if (res.ok) {
        toast.success("Template imported.");
        setImportOpen(false);
        setFile(null);
        setMeta({ title: "", description: "", category: "General", badge: "" });
        router.refresh();
      } else toast.error(res.error || "Could not save.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(t: TemplateRow) {
    if (!confirm(`Delete “${t.title}”? The file will be removed.`)) return;
    setBusy(t.id);
    const res = await deleteTemplateAction(t.id);
    setBusy(null);
    if (res.ok) {
      toast.success("Template deleted.");
      router.refresh();
    } else toast.error(res.error || "Could not delete.");
  }

  async function share(t: TemplateRow) {
    try {
      await navigator.clipboard.writeText(t.fileUrl);
      toast.success("Share link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-card border border-hairline bg-paper p-6 text-center sm:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
          <Sparkles className="size-3.5" /> Ready-to-use library
        </span>
        <h2 className="mx-auto mt-4 max-w-xl font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Finance templates that move work forward.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-body">
          Import your own working files — models, decks, checklists — and keep them alongside our branded starters.
        </p>
        <button
          onClick={() => setImportOpen(true)}
          className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          <Upload className="size-4" /> Import template
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                c === cat ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "border border-hairline text-body hover:bg-surface hover:text-ink",
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

      {/* Imported (your) templates */}
      {importedResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Your templates</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {importedResults.map((t) => {
              const color = TYPE_COLOR[t.fileType] || "#0a196d";
              return (
                <div key={t.id} className="group flex min-h-[190px] flex-col rounded-card border border-hairline bg-paper p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/5">
                  <div className="mb-4 flex items-start justify-between">
                    <span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${color}18`, color }}>
                      <FileText className="size-5" />
                    </span>
                    <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted">{t.fileType}</span>
                  </div>
                  <h3 className="flex flex-wrap items-center gap-2 font-display text-[15px] font-bold text-ink">
                    {t.title}
                    {t.badge && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", badgeTone[t.badge] || "bg-surface text-muted")}>{t.badge}</span>}
                  </h3>
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-body">{t.description || "Imported template."}</p>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-hairline pt-3.5">
                    <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-body">{t.category}{t.sizeBytes ? ` · ${formatBytes(t.sizeBytes)}` : ""}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => share(t)} title="Copy share link" className="grid size-8 place-items-center rounded-lg border border-hairline text-body transition-colors hover:bg-surface hover:text-ink">
                        <Link2 className="size-4" />
                      </button>
                      <button onClick={() => remove(t)} disabled={busy === t.id} title="Delete" className="grid size-8 place-items-center rounded-lg border border-hairline text-body transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400">
                        {busy === t.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                      <a href={t.fileUrl} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-hover">
                        <Download className="size-3.5" /> Get
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Curated starters */}
      <div className="space-y-3">
        {importedResults.length > 0 && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Starter library</h3>}
        {curatedResults.length === 0 && importedResults.length === 0 ? (
          <p className="py-16 text-center text-sm text-body">No templates match your search.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {curatedResults.map((t) => (
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
                    <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-hover">
                      <Upload className="size-3.5" /> Import
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import template"
        description="Upload a working file (XLSX, DOCX, PDF, CSV, PPTX, ZIP) — up to 25MB."
        size="lg"
        footer={
          <>
            <button onClick={() => setImportOpen(false)} className="rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface">Cancel</button>
            <button onClick={doImport} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60">
              {uploading && <Loader2 className="size-4 animate-spin" />} Import
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.docx,.doc,.pdf,.pptx,.ppt,.zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-hairline bg-surface/40 px-4 py-8 text-center transition-colors hover:border-brand hover:bg-brand-tint/30"
          >
            <UploadCloud className="size-8 text-brand" />
            {file ? (
              <span className="text-sm font-medium text-ink">{file.name} <span className="text-muted">({formatBytes(file.size)})</span></span>
            ) : (
              <>
                <span className="text-sm font-medium text-ink">Click to choose a file</span>
                <span className="text-xs text-muted">XLSX · DOCX · PDF · CSV · PPTX · ZIP</span>
              </>
            )}
          </button>

          <div>
            <label className="mb-1 block text-xs font-medium text-body">Title</label>
            <input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} placeholder="e.g. SaaS 3-Statement Model" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Category</label>
              <select value={meta.category} onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))} className={inputCls}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Badge (optional)</label>
              <select value={meta.badge} onChange={(e) => setMeta((m) => ({ ...m, badge: e.target.value }))} className={inputCls}>
                <option value="">None</option>
                <option value="Popular">Popular</option>
                <option value="New">New</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">Description</label>
            <textarea value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} rows={2} placeholder="What is this template for?" className={cn(inputCls, "resize-y")} />
          </div>
        </div>
      </Modal>

      {/* Curated preview modal */}
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
                <button onClick={() => { setPreview(null); setImportOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-hover">
                  <Upload className="size-4" /> Import your version
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
