import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCatalog } from "@/lib/services/catalog";
import { toStepperService } from "@/components/requests/stepper-utils";
import { getPortal, clientRequestDetail } from "@/lib/requests/portal";
import { NewRequestClient } from "./new-request-client";

export const metadata: Metadata = { title: "New request" };
export const dynamic = "force-dynamic";

/**
 * In-portal request flow. Arrivals:
 * - ?resume=1        the public stepper's draft (localStorage) after signup
 * - ?service=x       a service deep-link, preselected
 * - ?from=<id>       "Request again": same service, linked to the earlier
 *                    request, its files offered to carry over
 * - ?from=<id>&add=1 "Add a service": pick any service, still linked + files
 * - bare             a service picker
 */
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ from?: string; add?: string }> }) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/requests/new");
  const sp = await searchParams;
  const catalog = await getCatalog();

  let parent: { id: string; number: string; serviceName: string; serviceSlug: string; files: Array<{ id: string; name: string; from: "us" | "you" }> } | null = null;
  if (sp.from && /^[0-9a-f-]{36}$/i.test(sp.from)) {
    const d = await clientRequestDetail(sp.from, portal.client.id);
    if (d) {
      parent = {
        id: d.request.id,
        number: d.request.number,
        serviceName: d.request.serviceName,
        serviceSlug: d.request.serviceSlug,
        files: d.documents.filter((x) => x.scanStatus !== "infected").map((x) => ({ id: x.id, name: x.fileName, from: x.kind === "deliverable" ? ("us" as const) : ("you" as const) })),
      };
    }
  }
  return <NewRequestClient services={catalog.map(toStepperService)} parent={parent} addMode={sp.add === "1"} />;
}
