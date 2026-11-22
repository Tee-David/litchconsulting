"use client";

import { useState } from "react";
import { Archive, FileSpreadsheet, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { WbConversation, WbWorkbookRef } from "@/lib/litchai/workbench";
import { removeFileAction, setFileContextAction } from "@/lib/workbench/actions";
import { Button, Sheet } from "@/components/kit";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const FILE_LABELS: Record<string, string> = {
  trial_balance: "Trial balance",
  bank_statement: "Bank statement",
  ledger: "Ledger or cash book",
  invoices: "Invoices",
  payroll: "Payroll",
  asset_register: "Fixed asset register",
  sales_report: "Sales or settlement report",
  register: "Register or schedule",
  document: "Letter, contract or notes",
  books: "Books (several schedules)",
  other: "Other data",
};
const OPTIONS = Object.entries(FILE_LABELS).map(([value, label]) => ({ value, label }));

const when = (p?: [string, string]) => {
  if (!p) return null;
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return p[0] === p[1] ? f(p[0]) : `${f(p[0])} to ${f(p[1])}`;
};

function FileRow({ conversationId, wb, onConversation, onOpen, onAsk }: {
  conversationId: string;
  wb: WbWorkbookRef;
  onConversation: (c: WbConversation) => void;
  onOpen?: (id: string) => void;
  onAsk?: (name: string) => void;
}) {
  const role = wb.role ?? wb.facts?.role ?? "other";
  const [note, setNote] = useState(wb.note ?? "");
  const [saving, setSaving] = useState<"role" | "note" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    const r = await removeFileAction(conversationId, wb.id);
    setRemoving(false);
    if (r.ok) onConversation(r.conversation);
    else {
      setError(r.error);
      setConfirming(false);
    }
  };

  const save = async (patch: { role?: string; note?: string }, what: "role" | "note") => {
    setSaving(what);
    const r = await setFileContextAction(conversationId, wb.id, patch);
    setSaving(null);
    if (r.ok) {
      onConversation(r.conversation);
      setError(null);
    } else setError(r.error);
  };

  const facts = wb.facts;
  const meta = [facts?.bank, when(facts?.period), facts?.rows ? `${facts.rows.toLocaleString()} rows` : null].filter(Boolean).join(" · ");
  const doc = role === "document";
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-ctl", doc ? "bg-bad-soft text-bad" : "bg-good-soft text-good")} aria-hidden>
          {doc ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={wb.name}>{wb.name}</p>
          <p className="text-[12px] text-muted">{meta || "No dates found"}</p>
        </div>
        {onOpen ? <Button size="sm" variant="ghost" onClick={() => onOpen(wb.id)}>Open</Button> : null}
        {onAsk ? <Button size="sm" variant="ghost" onClick={() => onAsk(wb.name)}>Ask about it</Button> : null}
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${wb.name} from this job`}
            title="Remove from this job"
            className="grid size-11 shrink-0 place-items-center rounded-ctl text-muted hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div role="alertdialog" aria-label={`Remove ${wb.name}?`} className="rounded-ctl border border-hairline bg-bad-soft px-3 py-2.5 text-[13px] text-body">
          <p>
            <b className="font-semibold text-ink">Remove {wb.name} from this job?</b> Changes Sage proposed for it are dropped. The uploaded
            file is also deleted, unless a request or another workbench uses it.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={removing}>Keep it</Button>
            <Button size="sm" variant="danger" onClick={() => void remove()} disabled={removing}>
              {removing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null} Remove file
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,13rem)_1fr]">
        <div>
          <span className="mb-1 block text-[11.5px] text-muted">What it is{wb.role ? "" : " (read by the workbench)"}</span>
          <Select aria-label={`What ${wb.name} is`} value={role} options={OPTIONS} onChange={(v) => void save({ role: v }, "role")} />
        </div>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-muted">What to use it for (optional)</span>
          <input
            value={note}
            maxLength={300}
            placeholder={doc ? "e.g. loan terms for the loan schedule" : "e.g. use for the bank reconciliation"}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (wb.note ?? "") && void save({ note }, "note")}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-11 w-full rounded-ctl border border-hairline bg-paper px-2.5 text-sm text-ink outline-none focus:border-act focus:ring-2 focus:ring-act/20"
          />
        </label>
      </div>
      {saving ? <p className="flex items-center gap-1 text-[11.5px] text-muted"><Loader2 className="size-3 animate-spin" /> Saving…</p> : null}
      {error ? <p className="text-[12px] text-bad">{error}</p> : null}
    </li>
  );
}

/**
 * Files in this job: what each file is (labelled by the workbench, correctable) and
 * what to use it for. Sage reads this list before every answer, so "use the GTBank
 * statement" or "take the terms from the loan letter" finds the right file. Files
 * from one ZIP, RAR or 7z stay grouped under the archive's name.
 */
export function FilesSheet({ open, onClose, conv, onConversation, onAdd, onOpen, onAsk }: {
  open: boolean;
  onClose: () => void;
  conv: WbConversation;
  onConversation: (c: WbConversation) => void;
  onAdd: () => void;
  /** v8: open a source read-only, or point the next question at it (@[name]) */
  onOpen?: (id: string) => void;
  onAsk?: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const sources = conv.workbooks.filter((w) => w.kind !== "work");
  const low = q.trim().toLowerCase();
  const shown = low
    ? sources.filter((w) => `${w.name} ${w.facts?.label ?? ""} ${w.note ?? ""}`.toLowerCase().includes(low))
    : sources;
  const groups = new Map<string, WbWorkbookRef[]>();
  for (const w of shown) {
    const g = w.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), w]);
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your sources"
      description="The files you gave. Sage reads them and never changes them. Say what each file is and what it is for."
      footer={
        <>
          <Button onClick={onAdd}><Paperclip className="size-3.5" /> Add files</Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      {sources.length > 5 ? (
        <label className="mb-3 block">
          <span className="mb-1 block text-[12.5px] font-medium text-ink">Search the sources</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="File name, kind or note"
            className="h-11 w-full rounded-ctl border border-hairline bg-paper px-3 text-sm text-ink outline-none focus:border-act focus:ring-2 focus:ring-act/20"
          />
        </label>
      ) : null}
      {sources.length === 0 ? (
        <p className="text-sm text-muted">No files yet. Add files, or a ZIP of them.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">No source matches {q}.</p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([g, list]) => (
            <section key={g || "single"}>
              {g ? (
                <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                  <Archive className="size-3.5 text-muted" aria-hidden /> {g} <span className="font-normal text-muted">· {list.length} file{list.length === 1 ? "" : "s"}</span>
                </p>
              ) : null}
              <ul className="divide-y divide-hairline rounded-card border border-hairline bg-surface">
                {list.map((w) => (
                  <FileRow key={w.id} conversationId={conv.id} wb={w} onConversation={onConversation} onOpen={onOpen} onAsk={onAsk} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  );
}
