import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { issuer } from "@/lib/invoice/issuer";
import type { InvoiceData } from "@/lib/invoice/types";

const BRAND = "#0a196d";

/**
 * On-screen invoice — an always-"paper" document (white, dark ink) so it reads
 * the same in light/dark and mirrors the branded PDF. Shared by the builder's
 * live preview, the admin view page and the public pay page.
 */
export function InvoicePreview({ data }: { data: InvoiceData }) {
  const totals = computeTotals(data.items);
  const fmt = (n: number) => formatMoney(n, data.currency);

  return (
    <div className="mx-auto w-full max-w-3xl rounded-card border border-hairline bg-white p-6 text-[#0a0e1a] shadow-sm sm:p-9">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
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
          <p className="text-3xl font-extrabold tracking-tight">INVOICE</p>
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
            <span>Total Due ({data.currency})</span>
            <span className="tabular-nums">{fmt(totals.total)}</span>
          </div>
        </div>
      </div>

      {/* Pay */}
      {data.paymentUrl && (
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

      {/* Payment details + notes */}
      <div className="mt-7 grid gap-6 border-t border-[#e6e8f0] pt-5 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold">Payment details</p>
          <p className="mt-1 text-[#5b6474]">Bank: {issuer.bank.name}</p>
          <p className="text-[#5b6474]">Account name: {issuer.bank.accountName}</p>
          <p className="text-[#5b6474]">Account number: {issuer.bank.accountNumber}</p>
        </div>
        {(data.notes || data.terms) && (
          <div>
            {data.notes && (
              <>
                <p className="font-semibold">Notes</p>
                <p className="mt-1 text-[#5b6474]">{data.notes}</p>
              </>
            )}
            {data.terms && <p className="mt-3 text-xs text-[#8a92a6]">{data.terms}</p>}
          </div>
        )}
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
