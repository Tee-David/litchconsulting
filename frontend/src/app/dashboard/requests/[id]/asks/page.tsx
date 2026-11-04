import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHead } from "@/components/dashboard/ui";
import { AsksList } from "@/components/dashboard/asks-list";
import { getPortal, clientRequestDetail } from "@/lib/requests/portal";

export const metadata: Metadata = { title: "What we need from you" };
export const dynamic = "force-dynamic";

export default async function AsksPage({ params }: { params: Promise<{ id: string }> }) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/requests");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await clientRequestDetail(id, portal.client.id);
  if (!d) notFound();
  const { request: req, items, team } = d;
  const open = items.filter((i) => i.status === "open").length;
  return (
    <div className="max-w-3xl">
      <PageHead
        crumbs={[{ href: "/dashboard/requests", label: "Requests" }, { href: `/dashboard/requests/${req.id}`, label: req.number }, { label: "What we need" }]}
        title="What we need from you"
        lede={`${req.serviceName} · ${open ? `${open} open. Answer here, or reply to the email.` : "Nothing open right now."}`}
      />
      <AsksList
        requestId={req.id}
        who={team[0]?.name ?? "We"}
        items={items.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          detail: i.detail,
          status: i.status,
          dueAt: i.dueAt?.toISOString() ?? null,
          answer: i.answer,
          suppliedAt: i.suppliedAt?.toISOString() ?? null,
          receivedAt: i.receivedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
