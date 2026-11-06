import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/invoice/money";
import type { BillingDoc } from "@/app/admin/_lib/billing-data";
import { cn } from "@/lib/utils";

type Step = { code: string; label: string; state: "done" | "open" | "draft" | "bad"; status: string; note: string; href: string };

const PILL: Record<Step["state"], string> = {
  done: "bg-good-soft text-good",
  open: "bg-info-soft text-info",
  draft: "bg-neutral-soft text-body",
  bad: "bg-bad-soft text-bad",
};

function stepsFor(docs: BillingDoc[]): Step[] {
  const out: Step[] = [];
  const sorted = [...docs].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  for (const d of sorted) {
    const href = `/admin/billing/${d.kind === "quote" ? "quotes" : "invoices"}/${d.id}`;
    if (d.kind === "quote") {
      const accepted = ["accepted", "converted"].includes(d.status);
      out.push({
        code: d.number,
        label: "Quote",
        state: accepted ? "done" : d.status === "declined" ? "bad" : d.status === "draft" ? "draft" : "open",
        status: accepted ? "Accepted" : d.status.replace(/_/g, " "),
        note: formatMoney(d.total, d.currency),
        href,
      });
      continue;
    }
    if (d.depositPercent) {
      // Same-invoice deposit model: one invoice, deposit first, balance on delivery.
      const deposit = Math.round(d.total * d.depositPercent) / 100;
      const depositPaid = d.paid >= deposit - 0.005;
      out.push({
        code: d.number,
        label: `Deposit ${d.depositPercent}%`,
        state: depositPaid ? "done" : d.status === "overdue" ? "bad" : "open",
        status: depositPaid ? "Paid" : d.status === "overdue" ? "Late" : "Due",
        note: formatMoney(deposit, d.currency),
        href,
      });
      out.push({
        code: d.number,
        label: `Balance ${100 - d.depositPercent}%`,
        state: d.balance <= 0.005 ? "done" : "draft",
        status: d.balance <= 0.005 ? "Paid" : "On delivery",
        note: formatMoney(Math.max(0, d.total - deposit), d.currency),
        href,
      });
    } else {
      const paid = d.status === "paid" || d.balance <= 0.005;
      out.push({
        code: d.number,
        label: d.role === "balance" ? "Balance" : "Invoice",
        state: paid ? "done" : d.status === "overdue" ? "bad" : d.status === "draft" ? "draft" : "open",
        status: paid ? "Paid" : d.status === "partially_paid" ? "Part paid" : d.status.replace(/_/g, " "),
        note: formatMoney(d.total, d.currency),
        href,
      });
    }
  }
  const settled = sorted.filter((d) => d.kind === "invoice" && (d.status === "paid" || d.balance <= 0.005));
  if (settled.length) {
    const last = settled[settled.length - 1];
    out.push({ code: last.number, label: "Receipt", state: "done", status: "Sent", note: "Issued when paid", href: `/admin/billing/invoices/${last.id}` });
  }
  return out;
}

/**
 * "How one job is billed": the quote → deposit → balance → receipt chain for the
 * most recently active request, so the billing model is visible at a glance.
 */
export function JobChain({ docs }: { docs: BillingDoc[] }) {
  const byRequest = new Map<string, BillingDoc[]>();
  for (const d of docs) {
    if (!d.requestId) continue;
    byRequest.set(d.requestId, [...(byRequest.get(d.requestId) ?? []), d]);
  }
  const pick = [...byRequest.values()]
    .sort((a, b) => b.length - a.length || Math.max(...b.map((d) => +new Date(d.issueDate))) - Math.max(...a.map((d) => +new Date(d.issueDate))))
    .find((group) => group.some((d) => d.kind === "invoice"));
  if (!pick) return null;
  const steps = stepsFor(pick);
  if (steps.length < 2) return null;
  const head = pick[0];

  return (
    <section aria-label="How one job is billed" className="mb-5 rounded-card border border-hairline bg-paper p-4 sm:p-5">
      <p className="text-sm">
        <span className="font-display font-semibold text-ink">How one job is billed</span>{" "}
        <Link href={`/admin/requests/${head.requestId}`} className="text-muted hover:text-ink hover:underline">
          {head.requestNumber ?? "Request"} · {head.client}
        </Link>
      </p>
      <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <li key={`${s.code}-${s.label}`} className="flex shrink-0 items-center gap-2">
            {i > 0 ? <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden /> : null}
            <Link
              href={s.href}
              className="block w-40 rounded-ctl border border-hairline bg-cloud p-3 outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="block font-mono text-xs text-muted">{s.code}</span>
              <span className="mt-0.5 block text-sm font-semibold text-ink">{s.label}</span>
              <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", PILL[s.state])}>{s.status}</span>
              <span className="mt-1.5 block text-xs tabular-nums text-body">{s.note}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
