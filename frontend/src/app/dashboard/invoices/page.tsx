import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { listClientInvoices } from "@/lib/db/queries/invoices";
import { listClientPayments } from "@/lib/db/queries/requests";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import { InvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

const PAYMENT_LABELS: Record<string, string> = {
  success: "Successful",
  initialized: "Not completed",
  abandoned: "Not completed",
  failed: "Failed",
  flagged_amount_mismatch: "Under review",
  duplicate_success: "Under review",
};

export default async function ClientInvoicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/invoices");
  if (user.role === "admin") redirect("/admin");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const [invoices, payments] = await Promise.all([
    listClientInvoices(clientRow.id),
    listClientPayments(clientRow.id),
  ]);
  const shown = payments.filter((p) => p.status !== "initialized").slice(0, 10);

  return (
    <div className="space-y-6">
      <InvoicesClient invoices={invoices} />

      {/* Payment history — references to quote in support conversations */}
      {shown.length > 0 && (
        <div className="rounded-card border border-hairline bg-paper">
          <div className="border-b border-hairline px-5 py-4">
            <h3 className="font-display text-sm font-bold text-ink">Payment history</h3>
            <p className="mt-0.5 text-xs text-muted">
              Quote the reference if you ever need help with a payment.
            </p>
          </div>
          <div className="divide-y divide-hairline">
            {shown.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold text-ink">{p.reference}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDateTime(p.createdAt)}
                    {p.channel ? ` · ${p.channel.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(num(p.amount), p.currency)}
                  </span>
                  <span
                    className={
                      "rounded-full px-2.5 py-1 text-xs font-semibold " +
                      (p.status === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : p.status === "failed"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
                    }
                  >
                    {PAYMENT_LABELS[p.status] ?? p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
