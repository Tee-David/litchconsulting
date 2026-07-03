"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLine, Send, CheckCircle2, Download, Loader2, Ban } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { sendInvoiceAction, setInvoiceStatusAction } from "@/app/admin/finance/invoices/actions";

export function InvoiceViewActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast.success(res.error || ok);
    else toast.error(res.error || "Action failed.");
    router.refresh();
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/admin/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer" className={btn}>
        <Download className="size-4" /> PDF
      </a>
      <Link href={`/admin/finance/invoices/${id}/edit`} className={btn}>
        <PenLine className="size-4" /> Edit
      </Link>
      {status !== "paid" && (
        <button className={btn} disabled={busy !== null} onClick={() => run("paid", () => setInvoiceStatusAction(id, "paid"), "Marked paid.")}>
          {busy === "paid" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Mark paid
        </button>
      )}
      {status !== "void" && (
        <button className={btn} disabled={busy !== null} onClick={() => run("void", () => setInvoiceStatusAction(id, "void"), "Invoice voided.")}>
          <Ban className="size-4" /> Void
        </button>
      )}
      <button
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => run("send", () => sendInvoiceAction(id), "Invoice sent.")}
      >
        {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
      </button>
    </div>
  );
}
