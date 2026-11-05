import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { homeFor, roleOf } from "@/lib/access";
import { getPortal, clientBilling, portalErasureDue } from "@/lib/requests/portal";
import { ErasureScheduled } from "@/components/dashboard/erasure-scheduled";
import { clientAttention } from "@/lib/attention/client";
import { unreadCount } from "@/lib/notifications";
import { isPayable } from "@/lib/payments/amounts";
import { ClientFrame } from "@/components/dashboard/client-frame";

export const dynamic = "force-dynamic";

/**
 * Client portal shell. Server guard: signed out → /login; admins and staff →
 * their own home (the portal is for clients only).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard");
  if (user.banned) redirect("/login?banned=1");
  const role = roleOf(user);
  if (role !== "client") redirect(homeFor(role));

  const portal = await getPortal();
  if (!portal) {
    // Erasure scheduled: the portal is closed until it runs (or is cancelled).
    const due = await portalErasureDue();
    if (due) return <ErasureScheduled dueAt={due.toISOString()} />;
    redirect("/login?redirect=/dashboard");
  }

  // Badge counts. Failures here must never take the whole portal down.
  const [attention, unread, billing] = await Promise.all([
    clientAttention(portal.client.id).catch(() => []),
    unreadCount(user.id).catch(() => 0),
    clientBilling(portal.client.id).catch(() => null),
  ]);
  const toPay = billing
    ? billing.invoices.filter((i) => isPayable(i) && !billing.pendingTransfers.has(i.id)).length +
      billing.quotes.filter((q) => ["sent", "viewed"].includes(q.status)).length
    : 0;

  return (
    <ClientFrame
      user={{ name: user.name, email: user.email, sub: portal.client.company || "Client" }}
      counts={{ attention: attention.length, unread, billing: toPay }}
    >
      {children}
    </ClientFrame>
  );
}
