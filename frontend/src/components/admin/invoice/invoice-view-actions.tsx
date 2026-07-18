"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PenLine,
  Send,
  CheckCircle2,
  Download,
  Loader2,
  Ban,
  MoreHorizontal,
  Copy,
  Link2,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import {
  sendInvoiceAction,
  setInvoiceStatusAction,
  duplicateInvoiceAction,
  deleteInvoiceAction,
} from "@/app/admin/finance/invoices/actions";

export function InvoiceViewActions({
  id,
  status,
  number,
  publicToken,
}: {
  id: string;
  status: string;
  number: string;
  publicToken?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Portal "More" menu — the detail chrome can sit in a scroll/overflow
  // container that clips an absolutely-positioned menu, so render it in a
  // portal positioned against the trigger (same pattern as invoice-list.tsx).
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = 190;
      const height = 176;
      const top = r.bottom + height > window.innerHeight ? r.top - height - 4 : r.bottom + 6;
      setPos({ top, left: Math.max(8, r.right - width) });
    }
    setOpen((o) => !o);
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(key);
    setOpen(false);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast.success(res.error || ok);
    else toast.error(res.error || "Action failed.");
    router.refresh();
  }

  async function duplicate() {
    setBusy("duplicate");
    setOpen(false);
    const res = await duplicateInvoiceAction(id);
    setBusy(null);
    if (res.ok && res.id) {
      toast.success("Invoice duplicated.");
      router.push(`/admin/finance/invoices/${res.id}`);
    } else {
      toast.error(res.error || "Could not duplicate.");
    }
  }

  async function remove() {
    if (!confirm(`Delete invoice ${number}?`)) return;
    setBusy("delete");
    setOpen(false);
    const res = await deleteInvoiceAction(id);
    setBusy(null);
    if (res.ok) {
      toast.success("Invoice deleted.");
      router.push("/admin/finance/invoices");
    } else {
      toast.error(res.error || "Could not delete.");
    }
  }

  function copyLink() {
    setOpen(false);
    if (!publicToken) {
      toast.error("No shareable link for this invoice yet.");
      return;
    }
    navigator.clipboard
      .writeText(`${window.location.origin}/i/${publicToken}`)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy link."));
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60";
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-surface disabled:opacity-60";

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
      <button
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => run("send", () => sendInvoiceAction(id), "Invoice sent.")}
      >
        {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
      </button>

      <button ref={btnRef} type="button" onClick={toggle} className={btn} aria-label="More actions">
        <MoreHorizontal className="size-4" /> More
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 190 }}
            className="z-[100] rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/15"
          >
            <button className={item} disabled={busy !== null} onClick={duplicate}>
              <Copy className="size-4 text-muted" /> Duplicate
            </button>
            <button className={item} onClick={copyLink}>
              <Link2 className="size-4 text-muted" /> Get shareable link
            </button>
            {status !== "void" && (
              <button className={item} disabled={busy !== null} onClick={() => run("void", () => setInvoiceStatusAction(id, "void"), "Invoice voided.")}>
                <Ban className="size-4 text-muted" /> Void
              </button>
            )}
            <button className={`${item} text-red-600`} disabled={busy !== null} onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
