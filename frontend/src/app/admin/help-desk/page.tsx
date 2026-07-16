import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/ui/page-header";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { listTickets, listAllMessages } from "@/lib/db/queries/tickets";
import { HelpDeskView } from "@/components/admin/helpdesk/help-desk-view";

export const dynamic = "force-dynamic";

export default async function HelpDeskPage() {
  const [tickets, messages, admins] = await Promise.all([
    listTickets(),
    listAllMessages(),
    // Roster for the assignee picker (Better Auth owns `user`; read-only here).
    db.select({ name: user.name, email: user.email }).from(user).where(eq(user.role, "admin")),
  ]);

  const assignees = Array.from(
    new Set(admins.map((a) => (a.name || a.email || "").trim()).filter(Boolean)),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Help Desk" description="Client support tickets and conversations, all in one inbox." />
      <HelpDeskView
        tickets={tickets}
        messages={messages}
        assignees={assignees}
        // env is read here, in the RSC — never in the client component.
        aiConfigured={Boolean(process.env.LITCHAI_API_URL)}
      />
    </div>
  );
}
