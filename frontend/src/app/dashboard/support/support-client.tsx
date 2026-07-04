"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Plus, MessageSquare, AlertCircle, X, Loader2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { createClientTicketAction } from "./actions";
import type { TicketRow } from "@/lib/db/queries/tickets";

type SupportClientProps = {
  tickets: TicketRow[];
};

export function SupportClient({ tickets }: SupportClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form states
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Check search params for ?new=true to open the modal
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setIsModalOpen(true);
      // Clean up search params
      router.replace("/dashboard/support");
    }
  }, [searchParams, router]);

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      (t.subject || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.number || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || t.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!message.trim()) {
      setError("Please describe your issue.");
      return;
    }

    startTransition(async () => {
      const res = await createClientTicketAction({
        subject: subject.trim(),
        category,
        message: message.trim(),
      });

      if (res.ok && res.id) {
        setIsModalOpen(false);
        // Clear form
        setSubject("");
        setCategory("general");
        setMessage("");
        router.push(`/dashboard/support/${res.id}`);
      } else {
        setError(res.error || "Failed to create support ticket.");
      }
    });
  };

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
      {/* Header Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search tickets by ID or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
            />
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-brand self-start sm:self-auto"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover self-start sm:self-auto"
        >
          <Plus className="size-4" />
          New Ticket
        </button>
      </div>

      {/* Ticket List */}
      <div className="rounded-card border border-hairline bg-paper overflow-hidden">
        {filteredTickets.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={MessageSquare}
              title="No tickets found"
              description={
                searchQuery || selectedStatus !== "all"
                  ? "Try resetting your search query or status filter."
                  : "You haven't opened any support tickets yet. Click 'New Ticket' to get started."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Ticket ID</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last Activity</th>
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="group hover:bg-surface/50">
                    <td className="px-5 py-4 font-semibold text-ink">
                      <Link href={`/dashboard/support/${t.id}`} className="hover:text-brand">
                        {t.number}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-ink font-medium max-w-xs truncate">
                      {t.subject}
                    </td>
                    <td className="px-5 py-4 text-body capitalize">{t.category}</td>
                    <td className="px-5 py-4">{getPriorityBadge(t.priority)}</td>
                    <td className="px-5 py-4">{getStatusBadge(t.status)}</td>
                    <td className="px-5 py-4 text-body whitespace-nowrap">
                      {t.lastReplyAt ? new Date(t.lastReplyAt).toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Link
                        href={`/dashboard/support/${t.id}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-brand"
                      >
                        <ChevronRight className="size-4.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-night/50 backdrop-blur-sm"
            onClick={() => !isPending && setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-paper p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink transition-colors"
            >
              <X className="size-5" />
            </button>

            <h3 className="font-display text-lg font-bold text-ink mb-4">
              Open a Support Ticket
            </h3>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 p-3.5 text-sm font-semibold text-red-600 dark:text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="subject" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Subject / Topic
                </label>
                <input
                  id="subject"
                  type="text"
                  placeholder="e.g. Question about FY26 Corporate Tax filing"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
                >
                  <option value="general">General Inquiry</option>
                  <option value="billing">Billing & Invoices</option>
                  <option value="tax">Tax & Audits</option>
                  <option value="advisory">Advisory & Modeling</option>
                  <option value="technical">Technical Support</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Detailed Message
                </label>
                <textarea
                  id="message"
                  rows={5}
                  placeholder="Describe your request in detail. Attachments or screenshots can be shared by pasting links if needed."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-body hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
