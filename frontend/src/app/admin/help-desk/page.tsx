import { PageHeader } from "@/components/admin/ui/page-header";
import { listTickets, listAllMessages } from "@/lib/db/queries/tickets";
import { HelpDeskView } from "@/components/admin/helpdesk/help-desk-view";

export const dynamic = "force-dynamic";

export default async function HelpDeskPage() {
  const [tickets, messages] = await Promise.all([listTickets(), listAllMessages()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Help Desk" description="Client support tickets and conversations, all in one inbox." />
      <HelpDeskView tickets={tickets} messages={messages} />
    </div>
  );
}
