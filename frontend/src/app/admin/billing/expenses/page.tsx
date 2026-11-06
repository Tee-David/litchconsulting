import { and, eq, gte, isNull, lt, notInArray } from "drizzle-orm";
import { listExpenses } from "@/lib/db/queries/expenses";
import { db } from "@/lib/db/client";
import { invoice } from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";
import { ExpensesView, type ExpenseItem, type RemitSummary } from "@/components/admin/finance/expenses-view";
import { BillingTabs } from "@/components/admin/billing/billing-tabs";
import { requireArea } from "@/lib/server-user";

export const dynamic = "force-dynamic";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The FIRS period on show. WHT and VAT for a month are due by the 21st of the
 * next month, so up to the 21st this is last month; after it, this month (so far).
 */
function remitPeriod(now = new Date()) {
  const late = now.getDate() > 21;
  const start = new Date(now.getFullYear(), now.getMonth() - (late ? 0 : 1), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const due = new Date(start.getFullYear(), start.getMonth() + 1, 21);
  return { start, end, due, partial: late };
}

export default async function ExpensesPage() {
  await requireArea("billing", "/admin/billing/expenses");
  const p = remitPeriod();
  const [rows, issued] = await Promise.all([
    listExpenses(),
    // Output VAT: tax on invoices issued in the period (not quotes, drafts or voids).
    db
      .select({ taxTotal: invoice.taxTotal })
      .from(invoice)
      .where(
        and(
          eq(invoice.kind, "invoice"),
          eq(invoice.currency, "NGN"),
          isNull(invoice.deletedAt),
          notInArray(invoice.status, ["draft", "void"]),
          gte(invoice.issueDate, iso(p.start)),
          lt(invoice.issueDate, iso(p.end)),
        ),
      ),
  ]);

  const items: ExpenseItem[] = rows.map((e) => ({
    id: e.id,
    date: e.date,
    category: e.category,
    vendor: e.vendor,
    description: e.description,
    amount: num(e.amount),
    vatInput: num(e.vatInput),
    whtDeducted: num(e.whtDeducted),
    currency: e.currency || "NGN",
    method: e.method,
    reference: e.reference,
    receiptName: e.receiptKey ? e.receiptName || "receipt" : null,
  }));

  const inPeriod = items.filter((e) => e.currency === "NGN" && e.date >= iso(p.start) && e.date < iso(p.end));
  const remit: RemitSummary = {
    monthLabel: p.start.toLocaleString("en-GB", { month: "long" }),
    dueLabel: p.due.toLocaleString("en-GB", { day: "numeric", month: "short" }),
    partial: p.partial,
    periodStart: iso(p.start),
    periodEnd: iso(p.end),
    wht: inPeriod.reduce((s, e) => s + e.whtDeducted, 0),
    vatOutput: issued.reduce((s, i) => s + num(i.taxTotal), 0),
    vatInput: inPeriod.reduce((s, e) => s + e.vatInput, 0),
  };

  return (
    <div>
      <ExpensesView items={items} remit={remit} tabs={<BillingTabs active="expenses" />} />
    </div>
  );
}
