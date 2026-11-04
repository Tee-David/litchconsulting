import { inArray } from "drizzle-orm";
import { requireArea } from "@/lib/server-user";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { listTickets, listAllMessages } from "@/lib/db/queries/tickets";
import { HelpDeskView } from "@/components/admin/helpdesk/help-desk-view";
import { PageHead } from "@/components/admin/ui/surface";

export const dynamic = "force-dynamic";

/** Help desk: three panes on desktop, two on tablet, one at a time on phones with a back button. */
export default async function HelpDeskPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  await requireArea("helpDesk", "/admin/help-desk");
  const { ticket } = await searchParams;
  const [tickets, messages, team] = await Promise.all([
    listTickets(),
    listAllMessages(),
    // Roster for the assignee picker (Better Auth owns `user`; read-only here).
    db.select({ name: user.name, email: user.email }).from(user).where(inArray(user.role, ["admin", "staff"])),
  ]);
  const assignees = Array.from(new Set(team.map((a) => (a.name || a.email || "").trim()).filter(Boolean)));

  return (
    <div>
      <PageHead title="Help desk" lede="Client questions, linked to their requests. Replies reach the client by email and on their dashboard." />
      <div data-tour="helpdesk-view">
        <HelpDeskView
          tickets={tickets}
          messages={messages}
          assignees={assignees}
          initialTicketId={ticket && /^[0-9a-f-]{36}$/i.test(ticket) ? ticket : null}
          // env is read here, in the RSC — never in the client component.
          aiConfigured={Boolean(process.env.LITCHAI_API_URL)}
        />
      </div>
    </div>
  );
}
