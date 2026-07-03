"use client";

import { useState } from "react";
import { Receipt, Landmark, PiggyBank } from "lucide-react";
import { formatMoney, num } from "@/lib/invoice/money";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1 block text-xs font-medium text-body";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-2", strong && "border-t border-hairline pt-3")}>
      <span className={strong ? "font-semibold text-ink" : "text-body"}>{label}</span>
      <span className={cn("tabular-nums", strong ? "font-display text-lg font-bold text-ink" : "font-medium text-ink")}>
        {value}
      </span>
    </div>
  );
}

function VatCalc() {
  const [amount, setAmount] = useState("100000");
  const [rate, setRate] = useState("7.5");
  const [inclusive, setInclusive] = useState(false);
  const a = num(amount);
  const r = num(rate) / 100;
  const net = inclusive ? a / (1 + r) : a;
  const vat = net * r;
  const gross = net + vat;
  return (
    <>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Amount (₦)</label>
          <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>VAT rate (%)</label>
          <input className={inputCls} type="number" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="size-4 accent-brand" />
          Amount already includes VAT
        </label>
      </div>
      <div className="rounded-card border border-hairline bg-surface p-5">
        <Row label="Net (excl. VAT)" value={formatMoney(net)} />
        <Row label={`VAT (${rate}%)`} value={formatMoney(vat)} />
        <Row label="Gross (incl. VAT)" value={formatMoney(gross)} strong />
      </div>
    </>
  );
}

function LoanCalc() {
  const [principal, setPrincipal] = useState("5000000");
  const [rate, setRate] = useState("24");
  const [months, setMonths] = useState("12");
  const P = num(principal);
  const r = num(rate) / 100 / 12;
  const n = Math.max(1, Math.round(num(months)));
  const emi = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const total = emi * n;
  const interest = total - P;
  return (
    <>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Loan amount (₦)</label>
          <input className={inputCls} type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Annual rate (%)</label>
            <input className={inputCls} type="number" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Term (months)</label>
            <input className={inputCls} type="number" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="rounded-card border border-hairline bg-surface p-5">
        <Row label="Monthly payment" value={formatMoney(emi)} strong />
        <Row label="Total interest" value={formatMoney(interest)} />
        <Row label="Total payable" value={formatMoney(total)} />
      </div>
    </>
  );
}

function SavingsCalc() {
  const [target, setTarget] = useState("10000000");
  const [current, setCurrent] = useState("1000000");
  const [monthly, setMonthly] = useState("500000");
  const [rate, setRate] = useState("10");
  const T = num(target);
  const C = num(current);
  const M = num(monthly);
  const r = num(rate) / 100 / 12;
  let bal = C;
  let m = 0;
  while (bal < T && m < 1200) {
    bal = bal * (1 + r) + M;
    m++;
  }
  const reached = bal >= T;
  const years = Math.floor(m / 12);
  const rem = m % 12;
  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Goal (₦)</label>
            <input className={inputCls} type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Current savings (₦)</label>
            <input className={inputCls} type="number" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Monthly (₦)</label>
            <input className={inputCls} type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Annual return (%)</label>
            <input className={inputCls} type="number" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="rounded-card border border-hairline bg-surface p-5">
        {reached ? (
          <Row label="Time to reach goal" value={years > 0 ? `${years}y ${rem}m` : `${rem} months`} strong />
        ) : (
          <Row label="Time to reach goal" value="100+ years" strong />
        )}
        <Row label="Months" value={String(m)} />
        <Row label="Projected balance" value={formatMoney(bal)} />
      </div>
    </>
  );
}

const CALCS = [
  { key: "vat", label: "VAT / Tax", icon: Receipt, Comp: VatCalc },
  { key: "loan", label: "Loan / EMI", icon: Landmark, Comp: LoanCalc },
  { key: "savings", label: "Savings goal", icon: PiggyBank, Comp: SavingsCalc },
];

export function CalculatorsView() {
  const [tab, setTab] = useState("vat");
  const active = CALCS.find((c) => c.key === tab)!;
  const Comp = active.Comp;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CALCS.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === c.key ? "bg-brand text-white" : "border border-hairline text-body hover:bg-surface hover:text-ink",
            )}
          >
            <c.icon className="size-4" />
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-6 rounded-card border border-hairline bg-paper p-5 md:grid-cols-2">
        <Comp />
      </div>
    </div>
  );
}
