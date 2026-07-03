"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLine, Send, ArrowRightLeft, CheckCircle2, XCircle, Download, Loader2 } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { sendInvoiceAction, setInvoiceStatusAction, convertQuoteToInvoiceAction } from "@/app/admin/finance/invoices/actions";

export function QuoteViewActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string; id?: string }>,
    ok: string,
    goto?: (id: string) => string,
  ) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast.success(res.error || ok);
      if (goto && res.id) router.push(goto(res.id));
      else router.refresh();
    } else toast.error(res.error || "Action failed.");
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/admin/quotes/${id}/pdf`} target="_blank" rel="noopener noreferrer" className={btn}>
        <Download className="size-4" /> PDF
      </a>
      <Link href={`/admin/finance/quotes/${id}/edit`} className={btn}>
        <PenLine className="size-4" /> Edit
      </Link>
      {status !== "accepted" && (
        <button className={btn} disabled={busy !== null} onClick={() => run("accept", () => setInvoiceStatusAction(id, "accepted"), "Accepted.")}>
          <CheckCircle2 className="size-4" /> Accept
        </button>
      )}
      {status !== "declined" && (
        <button className={btn} disabled={busy !== null} onClick={() => run("decline", () => setInvoiceStatusAction(id, "declined"), "Declined.")}>
          <XCircle className="size-4" /> Decline
        </button>
      )}
      <button
        className={btn}
        disabled={busy !== null}
        onClick={() => run("convert", () => convertQuoteToInvoiceAction(id), "Converted to invoice.", (i) => `/admin/finance/invoices/${i}`)}
      >
        {busy === "convert" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />} Convert to invoice
      </button>
      <button
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => run("send", () => sendInvoiceAction(id), "Quote sent.")}
      >
        {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
      </button>
    </div>
  );
}
