import { isNull } from "drizzle-orm";
import { requireArea } from "@/lib/server-user";
import { ChatThread } from "@/components/admin/sage/chat-thread";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Sage: answers with citations; writes come back as proposals to confirm.
 * The thread fills the viewport under the topbar (and above the phone nav).
 */
export default async function SagePage() {
  await requireArea("sage", "/admin/sage");
  const clients = await db.select({ id: client.id, name: client.name, company: client.company }).from(client).where(isNull(client.deletedAt));

  return (
    <div className="-mx-4 -mb-24 -mt-5 flex h-[calc(100dvh-62px-56px-env(safe-area-inset-bottom))] flex-col sm:-mx-6 sm:-mt-6 lg:mx-0 lg:-mb-10 lg:mt-0 lg:h-[calc(100dvh-62px-3rem)]">
      <div className="hidden items-baseline gap-3 pb-3 lg:flex">
        <h1 className="font-display text-[1.6rem] font-bold tracking-tight text-ink">Sage</h1>
        <p className="text-sm text-body">Ask about clients, money, requests or Nigerian tax rules. Writes come back as proposals you confirm.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden border-hairline bg-paper lg:rounded-card lg:border">
        <ChatThread clients={clients} />
      </div>
    </div>
  );
}
