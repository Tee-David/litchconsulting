import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function HelpDeskPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Help Desk" description="Client support tickets and conversations, all in one inbox." />
      <EmptyState
        icon={LifeBuoy}
        title="Support inbox is coming next"
        description="Client tickets from the contact form and portal will land here, with statuses, assignment and email replies."
      />
    </div>
  );
}
