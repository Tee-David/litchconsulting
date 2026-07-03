import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Hash, FileText, Plus } from "lucide-react";
import { getClient } from "@/lib/db/queries/clients";
import { listInvoices } from "@/lib/db/queries/invoices";
import { EditClientButton } from "@/components/admin/client/edit-client-button";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { StatCard } from "@/components/admin/ui/stat-card";
import { formatMoney, num } from "@/lib/invoice/money";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, allInvoices] = await Promise.all([getClient(id), listInvoices()]);
  if (!client) notFound();

  const invoices = allInvoices.filter((i) => i.clientId === id);
  const billed = invoices.reduce((s, i) => s + num(i.total), 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + num(i.total), 0);

  const detail = [
    client.email && { icon: Mail, value: client.email, href: `mailto:${client.email}` },
    client.phone && { icon: Phone, value: client.phone, href: `tel:${client.phone}` },
    client.address && { icon: MapPin, value: client.address },
    client.taxId && { icon: Hash, value: `Tax ID: ${client.taxId}` },
  ].filter(Boolean) as { icon: typeof Mail; value: string; href?: string }[];

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">{client.company || client.name}</h2>
          {client.company && client.name && <p className="text-sm text-body">{client.name}</p>}
        </div>
        <EditClientButton client={client} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total billed" value={formatMoney(billed)} />
        <StatCard label="Paid" value={formatMoney(paid)} />
        <StatCard label="Invoices" value={invoices.length} hint="all time" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">Contact</h3>
            {detail.length === 0 ? (
              <p className="text-sm text-body">No contact details yet — use Edit to add them.</p>
            ) : (
              <ul className="space-y-3">
                {detail.map((d, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <d.icon className="mt-0.5 size-4 shrink-0 text-muted" />
                    {d.href ? (
                      <a href={d.href} className="text-ink hover:text-brand">
                        {d.value}
                      </a>
                    ) : (
                      <span className="text-ink">{d.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {client.notes && (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className="text-xs font-medium text-body">Notes</p>
                <p className="mt-1 text-sm text-ink">{client.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Invoices */}
        <div className="lg:col-span-2">
          <div className="rounded-card border border-hairline bg-paper">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h3 className="font-display text-sm font-bold text-ink">Invoices</h3>
              <Link
                href="/admin/finance/invoices/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                <Plus className="size-4" /> New invoice
              </Link>
            </div>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                <FileText className="size-8 text-muted" />
                <p className="text-sm text-body">No invoices for this client yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-hairline">
                {invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/admin/finance/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{inv.number}</p>
                      <p className="text-xs text-muted">{inv.issueDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-ink">{formatMoney(num(inv.total), inv.currency)}</span>
                      <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
