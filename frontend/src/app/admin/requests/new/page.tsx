import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireArea } from "@/lib/server-user";
import { listClients } from "@/lib/db/queries/clients";
import { getCatalog } from "@/lib/services/catalog";
import { formatMoney } from "@/lib/invoice/money";
import { ActLink, PageHead, Panel } from "@/components/admin/ui/surface";
import { NewRequestForm, type ClientChoice, type ServiceChoice } from "./new-request-form";

export const metadata: Metadata = { title: "New request" };
export const dynamic = "force-dynamic";

/** The firm opens a request for a client (after a call or an email). */
export default async function AdminNewRequestPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requireArea("requestsAll", "/admin/requests/new");
  const { clientId } = await searchParams;
  const [clients, catalog] = await Promise.all([listClients(), getCatalog()]);

  const clientChoices: ClientChoice[] = clients
    .filter((c) => !c.erasedAt)
    .map((c) => ({ id: c.id, label: c.company || c.name, hint: c.company ? c.name : c.email || undefined, hasLogin: Boolean(c.userId) }));
  const serviceChoices: ServiceChoice[] = catalog.map((s) => ({
    slug: s.slug,
    label: s.name,
    hint: s.pricingMode === "fixed" && s.priceNgn ? `${formatMoney(Number(s.priceNgn))} + VAT` : "Quote",
  }));

  return (
    <div>
      <PageHead
        title="New request"
        lede="Open a request for a client. The client sees it in their workspace and gets an email."
        actions={
          <ActLink href="/admin/requests" variant="secondary">
            <ArrowLeft /> Back to requests
          </ActLink>
        }
      />
      <Panel className="max-w-2xl">
        <NewRequestForm
          clients={clientChoices}
          services={serviceChoices}
          initialClientId={clientChoices.some((c) => c.id === clientId) ? clientId! : ""}
        />
      </Panel>
    </div>
  );
}
