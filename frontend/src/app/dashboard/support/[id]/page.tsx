import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calendar, HelpCircle, AlertCircle, Clock } from "lucide-react";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { getClientTicket } from "@/lib/db/queries/tickets";
import { Badge } from "@/components/admin/ui/badge";
import { SupportThreadClient } from "./support-thread-client";

export const dynamic = "force-dynamic";

export default async function ClientSupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/support");
  if (user.role === "admin") redirect("/admin");

  const { id } = await params;

  // Retrieve client record to enforce authorization
  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const data = await getClientTicket(id, clientRow.id);

  if (!data) notFound();

  const { ticket, messages } = data;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge tone="info">Open</Badge>;
      case "pending":
        return <Badge tone="warning">Pending</Badge>;
      case "resolved":
        return <Badge tone="success">Resolved</Badge>;
      case "closed":
        return <Badge tone="neutral">Closed</Badge>;
      default:
        return <Badge tone="neutral">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge tone="danger">Urgent</Badge>;
      case "high":
        return <Badge tone="warning">High</Badge>;
      case "normal":
        return <Badge tone="brand">Normal</Badge>;
      case "low":
        return <Badge tone="neutral">Low</Badge>;
      default:
        return <Badge tone="neutral">{priority}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-hairline pb-5">
        <div className="space-y-1.5">
          <Link
            href="/dashboard/support"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to Support
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {ticket.subject}
            </h1>
            <span className="text-sm font-semibold text-muted">{ticket.number}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(ticket.status)}
          {getPriorityBadge(ticket.priority)}
        </div>
      </div>

      {/* Main Conversation Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Columns: Thread Viewer */}
        <div className="lg:col-span-2">
          <SupportThreadClient
            ticketId={ticket.id}
            messages={messages}
            ticketStatus={ticket.status}
          />
        </div>

        {/* Right 1 Column: Metadata Sidebar */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-ink">Ticket Information</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Category</span>
                <span className="font-semibold text-ink capitalize">{ticket.category}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Priority</span>
                <span className="font-semibold text-ink capitalize">{ticket.priority}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Date Opened</span>
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Calendar className="size-4 text-muted" />
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-hairline">
                <span className="text-muted">Last Activity</span>
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Clock className="size-4 text-muted" />
                  {ticket.lastReplyAt ? new Date(ticket.lastReplyAt).toLocaleString() : new Date(ticket.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Firm SLA Guidelines Card */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink flex items-center gap-2">
              <HelpCircle className="size-4 text-brand" />
              Support Guidelines
            </h3>
            <div className="text-xs text-body leading-relaxed space-y-2.5">
              <p>
                Our consulting advisors monitor support tickets from <strong>8:00 AM to 5:00 PM WAT, Monday through Friday</strong>.
              </p>
              <p>
                For urgent billing or time-sensitive taxation modeling requests, replies are typically provided within <strong>2 hours</strong>.
              </p>
              <p className="flex items-start gap-1.5 bg-surface rounded-xl p-3 border border-hairline mt-1">
                <AlertCircle className="size-4 text-brand shrink-0 mt-0.5" />
                <span>
                  Please ensure any relevant financial attachments are linked in your conversation or shared via secure cloud folders.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
