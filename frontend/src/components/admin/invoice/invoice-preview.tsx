import { CheckCircle2 } from "lucide-react";
import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { issuer as defaultIssuer, type Issuer } from "@/lib/invoice/issuer";
import type { InvoiceData } from "@/lib/invoice/types";

const BRAND = "#0a196d";
const PAID = "#16a34a";

const STATUS_STAMP: Record<string, { label: string; color: string }> = {
  paid: { label: "PAID", color: "#16a34a" },
  sent: { label: "SENT", color: "#d97706" },
  overdue: { label: "OVERDUE", color: "#dc2626" },
  draft: { label: "DRAFT", color: "#8a92a6" },
  void: { label: "VOID", color: "#8a92a6" },
  accepted: { label: "ACCEPTED", color: "#16a34a" },
  declined: { label: "DECLINED", color: "#dc2626" },
};

/**
 * On-screen invoice — an always-"paper" document (white, dark ink) so it reads
 * the same in light/dark and mirrors the branded PDF. Shared by the builder's
 * live preview, the admin view page and the public pay page. A faint centred
 * favicon watermark + a status stamp brand every page.
 */
export function InvoicePreview({
  data,
  issuer = defaultIssuer,
  variant = "invoice",
  showPaidBanner = true,
  qrDataUrl,
}: {
  data: InvoiceData;
  issuer?: Issuer;
  variant?: "invoice" | "quote";
  /** In-paper green "paid" banner. Off on the public pay page, which shows its
   *  own thank-you hero above the paper (avoids a double banner). */
  showPaidBanner?: boolean;
  /** "Scan to pay" QR, rendered beside the payment details exactly as the PDF
   *  does — passed in by the server pages (this component also renders inside
   *  the client builder, so it can't generate one itself). */
  qrDataUrl?: string;
}) {
  const isQuote = variant === "quote";
  const totals = computeTotals(data.items);
  const fmt = (n: number) => formatMoney(n, data.currency);
  // When the paid banner shows, drop the diagonal PAID stamp — the banner is the
  // richer paid indicator (it carries the date) and the two would collide/read
  // as redundant. Every renderer applies this same rule, so parity holds.
  const showBanner = showPaidBanner && data.status === "paid";
  const stamp = showBanner ? undefined : STATUS_STAMP[data.status];

  return (
    <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-card border border-hairline bg-white p-4 text-[#0a0e1a] shadow-sm sm:p-6 md:p-9">
      {/* Centered favicon watermark (brand-tinted, faint) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className="block aspect-square w-[60%] max-w-[360px] opacity-[0.045]"
          style={{
            backgroundColor: BRAND,
            WebkitMaskImage: "url(/brand/litch-mark.svg)",
            maskImage: "url(/brand/litch-mark.svg)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      </div>

      {/* Status stamp */}
      {stamp && (
        <div className="pointer-events-none absolute right-5 top-[4.5rem] -rotate-12 sm:right-10 sm:top-24">
          <span
            className="inline-block rounded-lg border-[3px] px-3 py-0.5 font-display text-xl font-black uppercase tracking-wider opacity-70 sm:text-2xl"
            style={{ color: stamp.color, borderColor: stamp.color }}
          >
            {stamp.label}
          </span>
        </div>
      )}

      {/* PAID banner */}
      {showBanner && (
        <div
          className="relative mb-6 flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-semibold"
          style={{ background: "#eafaf0", border: "1px solid #c9efd8", color: PAID }}
        >
          <CheckCircle2 className="size-5 shrink-0" />
          <span>Invoice paid{data.paidAt ? ` on ${data.paidAt}` : ""}</span>
        </div>
      )}

      {/* Header */}
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold" style={{ color: BRAND }}>
            {issuer.name}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#5b6474]">
            {issuer.address}
            <br />
            {issuer.email}
            <br />
            {issuer.phone}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">{isQuote ? "QUOTE" : "INVOICE"}</p>
          <span className="ml-auto mt-1.5 block h-[3px] w-16 rounded" style={{ background: BRAND }} />
        </div>
      </div>

      {/* Meta */}
      <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Invoice No." value={data.number} />
        <Meta label="Issued" value={data.issueDate} />
        {data.dueDate && <Meta label="Due" value={data.dueDate} />}
        {data.projectTitle && <Meta label="Project" value={data.projectTitle} />}
      </div>

      {/* Bill to */}
      <div className="mt-7">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a92a6]">Bill to</p>
        {data.billTo.company && <p className="mt-1.5 font-bold">{data.billTo.company}</p>}
        {data.billTo.name && <p className="text-sm">{data.billTo.name}</p>}
        {data.billTo.address && <p className="text-sm text-[#5b6474]">{data.billTo.address}</p>}
        {data.billTo.email && <p className="text-sm text-[#5b6474]">{data.billTo.email}</p>}
        {data.billTo.taxId && <p className="text-sm text-[#5b6474]">Tax ID: {data.billTo.taxId}</p>}
        {!data.billTo.company && !data.billTo.name && (
          <p className="mt-1.5 text-sm italic text-[#8a92a6]">No client selected</p>
        )}
      </div>

      {/* Items */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="rounded" style={{ background: "#eef1fb" }}>
              <th className="rounded-l px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND }}>
                Description
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND }}>Qty</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND }}>Unit Price</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND }}>Tax</th>
              <th className="rounded-r px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm italic text-[#8a92a6]">
                  No line items yet
                </td>
              </tr>
            ) : (
              data.items.map((it, i) => (
                <tr key={i} className="border-b border-[#e6e8f0]">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{it.description || "—"}</p>
                    {it.detail && <p className="text-xs text-[#5b6474]">{it.detail}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(it.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it.taxRate}%</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(totals.lines[i]?.amount ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mt-5 flex justify-end">
        <div className="w-full max-w-xs">
          <Row label="Subtotal" value={fmt(totals.subtotal)} />
          <Row label="Tax" value={fmt(totals.taxTotal)} />
          <div
            className="mt-2 flex items-center justify-between rounded px-3 py-2.5 font-bold text-white"
            style={{ background: BRAND }}
          >
            <span>{isQuote ? "Total" : "Total Due"} ({data.currency})</span>
            <span className="tabular-nums">{fmt(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* Pay */}
      {!isQuote && data.paymentUrl && (
        <a
          href={data.paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: BRAND }}
        >
          Pay this invoice
        </a>
      )}

      {/* Signature */}
      <div className="relative mt-8 flex justify-end">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={issuer.signatory.signatureImage}
            alt=""
            className="mx-auto -mb-1.5 h-14 w-auto object-contain"
          />
          <div className="mx-auto w-44 border-t border-[#0a0e1a]" />
          <p className="mt-1.5 font-bold">{issuer.signatory.name}</p>
          <p className="mt-0.5 text-xs text-[#8a92a6]">Authorised signatory</p>
        </div>
      </div>

      {/* Payment details + notes */}
      <div className="relative mt-7 grid gap-6 border-t border-[#e6e8f0] pt-5 text-sm sm:grid-cols-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-semibold">Payment details</p>
            <p className="mt-1 text-[#5b6474]">Bank: {issuer.bank.name}</p>
            <p className="text-[#5b6474]">Account name: {issuer.bank.accountName}</p>
            <p className="text-[#5b6474]">Account number: {issuer.bank.accountNumber}</p>
          </div>
          {qrDataUrl && (
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="" className="size-[62px]" />
              <p className="mt-0.5 text-[8px] leading-none text-[#5b6474]">Scan to pay</p>
            </div>
          )}
        </div>
        {(data.notes || data.terms) && (
          <div>
            {data.notes && (
              <>
                <p className="font-semibold">Notes</p>
                <ul className="mt-1 space-y-0.5 text-[#5b6474]">
                  {data.notes
                    .split(/\n+/)
                    .filter(Boolean)
                    .map((line, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span aria-hidden>•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                </ul>
              </>
            )}
            {data.terms && <p className="mt-3 text-xs text-[#8a92a6]">{data.terms}</p>}
          </div>
        )}
      </div>

      {/* Footer contact band */}
      <div className="relative mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e8f0] pt-4 text-xs text-[#8a92a6]">
        <span className="font-semibold" style={{ color: BRAND }}>
          {issuer.name}
        </span>
        <span>
          {issuer.website} · {issuer.phone}
        </span>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a92a6]">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-[#5b6474]">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
