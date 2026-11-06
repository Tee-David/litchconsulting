"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Landmark, Loader2, Plus, Wallet } from "lucide-react";
import { Button, DataTable, EmptyState, Sheet, StatusChip, type BulkAction, type TableView } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { confirmTransferAction, proofUrlAction, rejectTransferAction } from "@/app/admin/billing/billing-actions";
import { recordManualPaymentAction } from "@/app/admin/billing/invoices/actions";
import type { PaymentLine } from "@/app/admin/_lib/billing-data";
import { downloadCsv } from "@/components/admin/ui/csv";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const methodOf = (p: PaymentLine) =>
  p.hasProof
    ? "Bank transfer, with proof"
    : p.provider === "paystack"
      ? `Paystack${p.channel ? `, ${p.channel.replace(/_/g, " ")}` : ""}`
      : p.provider === "manual"
        ? `Recorded by hand${p.channel && p.channel !== "mark_paid" ? `, ${p.channel.replace(/_/g, " ")}` : ""}`
        : p.provider;

export type OpenInvoice = { id: string; number: string; client: string; balance: number; currency: string };

const inputCls =
  "h-10 w-full rounded-ctl border border-line-strong bg-paper px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function PaymentsTable({ lines, openInvoices }: { lines: PaymentLine[]; openInvoices: OpenInvoice[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const proofParam = params.get("proof");
  const [proofId, setProofId] = useState<string | null>(proofParam);
  const [recordOpen, setRecordOpen] = useState(params.get("record") === "1");
  useEffect(() => setProofId(proofParam), [proofParam]);

  const closeProof = () => {
    setProofId(null);
    if (proofParam) {
      const next = new URLSearchParams(params.toString());
      next.delete("proof");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  };
  const proof = lines.find((l) => l.id === proofId) ?? null;
  const [exportOpen, setExportOpen] = useState(false);
  // Months that have confirmed money, newest first, for the accounts export.
  const months = useMemo(() => [...new Set(lines.filter((l) => l.status === "success").map((l) => l.at.slice(0, 7)))].sort().reverse(), [lines]);
  const [exportMonth, setExportMonth] = useState("all");
  const exportForAccounts = () => {
    const rows = lines.filter((l) => l.status === "success" && (exportMonth === "all" || l.at.startsWith(exportMonth)));
    downloadCsv(
      `payments-for-accounts-${exportMonth}`,
      ["Date", "Reference", "Client", "Invoice", "Request", "Method", "Amount", "Currency", "Debit account", "Credit account", "Confirmed on"],
      rows.map((p) => [
        p.at.slice(0, 10), p.reference, p.payer, p.invoiceNumber ?? "", p.requestNumber ?? "", methodOf(p), p.amount, p.currency,
        // A WHT credit note settles the invoice without cash: it is a tax asset, not bank.
        p.channel === "wht_credit" ? "WHT receivable" : "Bank", "Trade receivables", p.confirmedAt?.slice(0, 10) ?? p.at.slice(0, 10),
      ]),
    );
    setExportOpen(false);
  };
  const pending = lines.filter((l) => l.status === "proof");

  const columns = useMemo<ColumnDef<PaymentLine, unknown>[]>(
    () => [
      { id: "at", accessorKey: "at", header: "Date", meta: { label: "Date", mobile: "meta" }, cell: ({ row }) => <span className="whitespace-nowrap text-body">{when(row.original.at)}</span> },
      {
        id: "payer",
        accessorKey: "payer",
        header: "Payer",
        meta: { label: "Payer", mobile: "title", hideable: false },
        cell: ({ row: { original: p } }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{p.payer}</span>
            <span className="block truncate text-xs text-muted">{p.invoiceNumber ?? "No invoice"}{p.requestNumber ? ` · ${p.requestNumber}` : ""}</span>
          </span>
        ),
      },
      { id: "method", accessorFn: methodOf, header: "Method", meta: { label: "Method", mobile: "subtitle" }, cell: ({ row }) => <span className="text-body">{methodOf(row.original)}</span> },
      { id: "status", accessorKey: "status", header: "Status", meta: { label: "Status", mobile: "badge" }, cell: ({ row }) => <StatusChip domain="payment" status={row.original.status} /> },
      {
        id: "amount",
        accessorKey: "amount",
        header: "Amount",
        meta: { label: "Amount", align: "right", mobile: "meta" },
        cell: ({ row }) => <span className="tabular-nums font-medium text-ink">{formatMoney(row.original.amount, row.original.currency)}</span>,
      },
      { id: "reference", accessorKey: "reference", header: "Reference", meta: { label: "Reference", defaultHidden: true, mobile: "hidden" }, cell: ({ row }) => <span className="font-mono text-xs text-muted">{row.original.reference}</span> },
    ],
    [],
  );

  const views: TableView<PaymentLine>[] = [
    { id: "all", label: "All", predicate: () => true },
    { id: "confirm", label: "To confirm", predicate: (p) => p.status === "proof" },
    { id: "paystack", label: "Paystack", predicate: (p) => p.provider === "paystack" },
    { id: "transfer", label: "Transfers", predicate: (p) => p.hasProof || (p.provider === "manual" && p.channel === "bank_transfer") },
    { id: "problems", label: "Failed or flagged", predicate: (p) => ["failed", "rejected", "flagged_amount_mismatch", "duplicate_success"].includes(p.status) },
  ];

  const bulk: BulkAction<PaymentLine>[] = [
    {
      id: "csv",
      label: "Export CSV",
      icon: <Download className="size-4" />,
      run: (rows) =>
        downloadCsv(
          "payments",
          ["Date", "Payer", "Invoice", "Request", "Method", "Status", "Amount", "Currency", "Reference"],
          rows.map((p) => [p.at.slice(0, 10), p.payer, p.invoiceNumber ?? "", p.requestNumber ?? "", methodOf(p), p.status, p.amount, p.currency, p.reference]),
        ),
    },
  ];

  return (
    <>
      {pending.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-card border border-warn/30 bg-warn-soft p-4 sm:flex-row sm:items-center">
          <Landmark className="size-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-ink">
              {pending.length} transfer {pending.length === 1 ? "proof" : "proofs"} to confirm
            </p>
            <p className="text-body">
              {pending
                .slice(0, 3)
                .map((p) => `${p.payer} ${formatMoney(p.amount, p.currency)}`)
                .join(" · ")}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setProofId(pending[0].id)}>
            Check the first one
          </Button>
        </div>
      )}
      <DataTable
        label="Payments"
        storageKey="admin-payments"
        columns={columns}
        data={lines}
        getRowId={(p) => p.id}
        views={views}
        urlState
        searchPlaceholder="Search payer, invoice or reference"
        searchText={(p) => `${p.payer} ${p.invoiceNumber ?? ""} ${p.reference} ${p.requestNumber ?? ""}`}
        bulkActions={bulk}
        onRowClick={(p) => (p.status === "proof" || p.hasProof ? setProofId(p.id) : router.push(`/admin/billing/invoices/${p.invoiceId}`))}
        toolbarEnd={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)}>
              <Download className="size-4" /> Export for accounts
            </Button>
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <Plus className="size-4" /> Record a payment
            </Button>
          </div>
        }
        emptyState={
          <EmptyState
            icon={<Wallet />}
            title="No payments yet"
            why="Paystack payments appear here on their own. Transfers appear when a client uploads a proof, or when you record one."
            action={<Button onClick={() => setRecordOpen(true)}>Record a payment</Button>}
          />
        }
      />
      <ProofSheet line={proof} onClose={closeProof} onNext={() => setProofId(pending.find((p) => p.id !== proofId)?.id ?? null)} hasNext={pending.filter((p) => p.id !== proofId).length > 0} />
      <RecordSheet open={recordOpen} onClose={() => setRecordOpen(false)} invoices={openInvoices} />
      <Sheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export for accounts"
        description="Confirmed payments only, one row each, with the accounts the bookkeeper posts them to."
        size="sm"
        footer={
          <>
            <Button onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={exportForAccounts}>
              <Download className="size-4" /> Download CSV
            </Button>
          </>
        }
      >
        <span className="mb-1 block text-xs font-medium text-body">Period</span>
        <Select
          aria-label="Period"
          value={exportMonth}
          onChange={setExportMonth}
          options={[{ value: "all", label: "All confirmed payments" }, ...months.map((m) => ({ value: m, label: new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) }))]}
        />
      </Sheet>
    </>
  );
}

function ProofSheet({ line, onClose, onNext, hasNext }: { line: PaymentLine | null; onClose: () => void; onNext: () => void; hasNext: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"confirm" | "reject">("confirm");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  useEffect(() => {
    if (!line) return;
    setAmount(String(line.amount));
    setMode("confirm");
    setReason("");
    setErr(null);
    setPreview(null);
    setPreviewErr(null);
    if (line.hasProof) {
      void proofUrlAction(line.id).then((r) => (r.ok ? setPreview({ url: r.url, name: r.name }) : setPreviewErr(r.error)));
    }
  }, [line]);

  if (!line) return null;
  const amt = Number(amount) || 0;
  const target = line.depositDue && line.invoiceBalance > line.invoiceTotal - line.depositDue ? line.depositDue : line.invoiceBalance;
  const diff = Math.round((target - amt) * 100) / 100;
  const isImg = preview && /\.(png|jpe?g|webp|gif)$/i.test(preview.name);
  const isPdf = preview && /\.pdf$/i.test(preview.name);
  const done = line.status !== "proof";

  const go = async () => {
    setBusy(true);
    setErr(null);
    const r =
      mode === "confirm"
        ? await confirmTransferAction({ paymentId: line.id, amount: amt, receivedOn: date })
        : await rejectTransferAction({ paymentId: line.id, reason });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message);
    router.refresh();
    if (hasNext) onNext();
    else onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      dismissible={!busy}
      title={done ? `Transfer from ${line.payer}` : `Confirm ${line.payer}'s transfer`}
      description={`${line.invoiceNumber ?? "No invoice"}${line.requestNumber ? ` · ${line.requestNumber}` : ""} · uploaded ${when(line.at)}`}
      footer={
        done ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setMode(mode === "confirm" ? "reject" : "confirm")} disabled={busy}>
              {mode === "confirm" ? "It does not match" : "Back to confirm"}
            </Button>
            <Button variant={mode === "confirm" ? "primary" : "danger"} onClick={go} disabled={busy || (mode === "confirm" ? amt <= 0 : reason.trim().length < 3)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "confirm" ? `Confirm ${formatMoney(amt, line.currency)} received` : "Tell the client it does not match"}
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="grid min-h-60 place-items-center overflow-hidden rounded-card border border-hairline bg-surface">
            {previewErr ? (
              <p className="p-4 text-center text-sm text-bad">{previewErr}</p>
            ) : !preview ? (
              line.hasProof ? (
                <Loader2 className="size-5 animate-spin text-muted" />
              ) : (
                <p className="p-4 text-center text-sm text-body">No proof file on this payment.</p>
              )
            ) : isImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={`Transfer proof from ${line.payer}`} className="max-h-96 w-full object-contain" />
            ) : isPdf ? (
              <iframe src={preview.url} title="Transfer proof" className="h-96 w-full" />
            ) : (
              <p className="p-4 text-center text-sm text-body">{preview.name}</p>
            )}
          </div>
          {preview && (
            <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              <ExternalLink className="size-3.5" /> Open {preview.name}
            </a>
          )}
          <p className="text-xs text-muted">Check the amount, the narration and the date against your banking app before you confirm.</p>
        </div>
        <div className="min-w-0 space-y-4 text-sm">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
            <dt className="text-muted">Invoice total</dt>
            <dd className="text-right tabular-nums text-ink">{formatMoney(line.invoiceTotal, line.currency)}</dd>
            {line.depositDue ? (
              <>
                <dt className="text-muted">Deposit due</dt>
                <dd className="text-right tabular-nums text-ink">{formatMoney(line.depositDue, line.currency)}</dd>
              </>
            ) : null}
            <dt className="text-muted">Still to pay</dt>
            <dd className="text-right tabular-nums text-ink">{formatMoney(line.invoiceBalance, line.currency)}</dd>
            <dt className="text-muted">Client says they sent</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">{formatMoney(line.amount, line.currency)}</dd>
          </dl>
          {done ? (
            <p className="rounded-ctl bg-surface p-3 text-body">
              <StatusChip domain="payment" status={line.status} /> {line.confirmedAt ? `on ${when(line.confirmedAt)}` : ""}
            </p>
          ) : mode === "confirm" ? (
            <>
              <div
                className={cn(
                  "flex gap-2 rounded-ctl p-3",
                  Math.abs(diff) < 0.5 ? "bg-good-soft text-good" : diff > 0 ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
                )}
              >
                {Math.abs(diff) < 0.5 ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                <p className="text-ink">
                  {Math.abs(diff) < 0.5
                    ? line.depositDue && target === line.depositDue
                      ? "Matches the deposit. Confirming marks the deposit paid and starts the work."
                      : "Amounts match. Confirming marks the invoice paid, emails the receipt and moves the request on."
                    : diff > 0
                      ? `${formatMoney(diff, line.currency)} short. Confirming records a part payment; the client sees the balance still to pay.`
                      : `${formatMoney(-diff, line.currency)} more than due. Check before confirming.`}
                </p>
              </div>
              <label className="block">
                <span className="mb-1.5 block font-medium text-ink">Amount received</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-medium text-ink">Date received</span>
                <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </label>
            </>
          ) : (
            <label className="block">
              <span className="mb-1.5 block font-medium text-ink">Why it does not match (the client sees this)</span>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="We cannot find this transfer in our account. Please check the account number and send the bank's receipt."
                className={cn(inputCls, "h-auto py-2")}
              />
            </label>
          )}
          {err ? <p className="text-bad">{err}</p> : null}
          <Link href={`/admin/billing/invoices/${line.invoiceId}`} className="inline-flex text-sm font-medium text-accent hover:underline">
            Open {line.invoiceNumber ?? "the invoice"}
          </Link>
        </div>
      </div>
    </Sheet>
  );
}

function RecordSheet({ open, onClose, invoices }: { open: boolean; onClose: () => void; invoices: OpenInvoice[] }) {
  const toast = useToast();
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inv = invoices.find((i) => i.id === invoiceId);

  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await recordManualPaymentAction({ invoiceId, amount: Number(amount), channel, paidAt: date, note });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "That did not save.");
    toast.success(`Recorded ${formatMoney(Number(amount), inv?.currency)} against ${inv?.number}.`);
    router.refresh();
    onClose();
    setInvoiceId("");
    setAmount("");
    setNote("");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Record a payment"
      description="For money that reached the account without a proof upload: a transfer, a cheque or cash."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={busy || !invoiceId || !(Number(amount) > 0)}>
            {busy ? "Recording…" : "Record payment"}
          </Button>
        </>
      }
    >
      {invoices.length === 0 ? (
        <EmptyState compact title="No unpaid invoices" why="Every sent invoice is paid. Send an invoice first, then record money against it." />
      ) : (
        <div className="space-y-4 text-sm">
          <label className="block">
            <span className="mb-1.5 block font-medium text-ink">Invoice</span>
            <Select
              aria-label="Invoice"
              value={invoiceId}
              onChange={(v) => {
                setInvoiceId(v);
                const i = invoices.find((x) => x.id === v);
                if (i) setAmount(String(i.balance));
              }}
              placeholder="Choose an unpaid invoice"
              searchable
              options={invoices.map((i) => ({ value: i.id, label: `${i.number} · ${i.client} · ${formatMoney(i.balance, i.currency)} due` }))}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block font-medium text-ink">Amount received</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-medium text-ink">Date received</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block font-medium text-ink">How it was paid</span>
            <Select
              aria-label="How it was paid"
              value={channel}
              onChange={setChannel}
              options={[
                { value: "bank_transfer", label: "Bank transfer" },
                { value: "cheque", label: "Cheque" },
                { value: "cash", label: "Cash" },
                { value: "wht_credit", label: "WHT credit note" },
                { value: "other", label: "Other" },
              ]}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-medium text-ink">Note (optional, team only)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Zenith ref 0000132611…" />
          </label>
          <p className="text-muted">Paid in full sends the receipt and moves the request on. Less than the balance records a part payment.</p>
          {err ? <p className="text-bad">{err}</p> : null}
        </div>
      )}
    </Sheet>
  );
}
