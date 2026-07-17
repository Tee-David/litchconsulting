import { PageHeader } from "@/components/admin/ui/page-header";
import { ChatThread } from "@/components/admin/copilot/chat-thread";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";
import { isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const clients = await db
    .select({ id: client.id, name: client.name, company: client.company })
    .from(client)
    .where(isNull(client.deletedAt));

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col space-y-6">
      <PageHeader
        title="Copilot"
        description="Query the firm's knowledge base and your client's specific data."
      />
      <div className="flex-1 overflow-hidden rounded-2xl border border-hairline bg-paper shadow-sm">
        <ChatThread clients={clients} />
      </div>
    </div>
  );
}
