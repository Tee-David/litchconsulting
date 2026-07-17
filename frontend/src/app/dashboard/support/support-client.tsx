"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Plus,
  MessageSquare,
  AlertCircle,
  X,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Rocket,
  Receipt,
  Briefcase,
  FolderOpen,
  ShieldCheck,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format-date";
import {
  HELP_CATEGORIES,
  searchArticles,
  articlesInCategory,
  categoryCounts,
  categoryMeta,
  type HelpArticle,
  type HelpCategoryIcon,
  type HelpCategoryKey,
} from "@/lib/content/help-articles";
import { cn } from "@/lib/utils";
import { createClientTicketAction } from "./actions";
import type { TicketRow } from "@/lib/db/queries/tickets";

type SupportClientProps = {
  tickets: TicketRow[];
  /** the client's service requests, for the optional "related request" link */
  requests?: { id: string; number: string; serviceName: string }[];
};

/** help-articles.ts stays pure data — icon names are mapped to lucide here. */
const CATEGORY_ICONS: Record<HelpCategoryIcon, LucideIcon> = {
  rocket: Rocket,
  receipt: Receipt,
  briefcase: Briefcase,
  folder: FolderOpen,
  shield: ShieldCheck,
};

const TICKET_CATEGORY_OPTIONS = [
  { value: "general", label: "General Inquiry" },
  { value: "billing", label: "Billing & Invoices" },
  { value: "tax", label: "Tax & Audits" },
  { value: "advisory", label: "Advisory & Modeling" },
  { value: "technical", label: "Technical Support" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function SupportClient({ tickets, requests = [] }: SupportClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Knowledge-base browsing state
  const [helpQuery, setHelpQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<HelpCategoryKey | null>(null);
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  // Form states
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ?new=true opens the modal; ?request=<id> pre-links a service request
  // (e.g. the "Contact support" button on a request workspace).
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      const linked = searchParams.get("request");
      if (linked) setRequestId(linked);
      setIsModalOpen(true);
      // Clean up search params
      router.replace("/dashboard/support");
    }
  }, [searchParams, router]);

  const counts = useMemo(() => categoryCounts(), []);

  /** Search wins over category browsing; otherwise show the open category. */
  const visibleArticles: HelpArticle[] = useMemo(() => {
    if (helpQuery.trim()) return searchArticles(helpQuery);
    if (openCategory) return articlesInCategory(openCategory);
    return [];
  }, [helpQuery, openCategory]);

  const isSearching = helpQuery.trim().length > 0;
  const showingArticles = isSearching || openCategory !== null;

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      (t.subject || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.number || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = selectedStatus === "all" || t.status === selectedStatus;

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
        requestId: requestId || null,
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
    <div className="space-y-8">
      {/* ───────────────── Hero + knowledge-base search ───────────────── */}
      <section
        data-tour="support-kb"
        className="rounded-card border border-hairline bg-gradient-to-b from-brand-tint/60 to-paper px-6 py-10 text-center sm:px-10 sm:py-14"
      >
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand text-white keep-brand">
          <LifeBuoy className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">How can we help?</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-body">
          Search our help articles, or open a ticket and our team will get back to you.
        </p>

        <div className="relative mx-auto mt-6 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={helpQuery}
            onChange={(e) => {
              setHelpQuery(e.target.value);
              setOpenArticle(null);
            }}
            placeholder="Search for an answer — e.g. “how do I pay an invoice?”"
            aria-label="Search help articles"
            className="h-12 w-full rounded-full border border-hairline bg-paper pl-11 pr-11 text-sm text-ink shadow-sm outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          {helpQuery && (
            <button
              type="button"
              onClick={() => setHelpQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </section>

      {/* ───────────────── Categories / articles ───────────────── */}
      <section className="space-y-4">
        {!showingArticles ? (
          <>
            <h2 className="font-display text-lg font-bold text-ink">Browse topics</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {HELP_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c.icon];
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setOpenCategory(c.key);
                      setOpenArticle(null);
                    }}
                    className="group flex flex-col items-start rounded-card border border-hairline bg-paper p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                  >
                    <span className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-display text-sm font-bold text-ink">{c.label}</span>
                    <span className="mt-1 text-xs leading-relaxed text-body">{c.description}</span>
                    <span className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {counts[c.key] ?? 0} article{(counts[c.key] ?? 0) === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {isSearching ? (
                  <h2 className="font-display text-lg font-bold text-ink">
                    {visibleArticles.length} result{visibleArticles.length === 1 ? "" : "s"} for “{helpQuery.trim()}”
                  </h2>
                ) : (
                  <>
                    <h2 className="font-display text-lg font-bold text-ink">
                      {categoryMeta(openCategory!)?.label}
                    </h2>
                    <p className="mt-0.5 text-sm text-body">{categoryMeta(openCategory!)?.description}</p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpenCategory(null);
                  setHelpQuery("");
                  setOpenArticle(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-body transition-colors hover:bg-surface hover:text-ink"
              >
                <ChevronLeft className="size-4" /> All topics
              </button>
            </div>

            {visibleArticles.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No articles matched"
                description="Try a different wording, or open a ticket and we'll answer you directly."
              />
            ) : (
              <div className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-paper">
                {visibleArticles.map((a) => {
                  const expanded = openArticle === a.slug;
                  return (
                    <div key={a.slug}>
                      <button
                        type="button"
                        onClick={() => setOpenArticle(expanded ? null : a.slug)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface/60"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{a.question}</span>
                          {isSearching && (
                            <span className="mt-0.5 block text-xs text-muted">
                              {categoryMeta(a.category)?.label}
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-muted transition-transform",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                      {expanded && (
                        <div className="border-t border-hairline bg-cloud/40 px-5 py-4">
                          <p className="whitespace-pre-line text-sm leading-relaxed text-body">{a.answer}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* ───────────────── Still need help? ───────────────── */}
      <section
        data-tour="support-contact"
        className="flex flex-col items-center justify-between gap-4 rounded-card border border-hairline bg-surface px-6 py-6 sm:flex-row"
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
            <MessageSquare className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-ink">Still need help?</h3>
            <p className="mt-0.5 text-sm text-body">
              Open a ticket and our team will reply here and by email.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
        >
          <Plus className="size-4" />
          Contact support
        </button>
      </section>

      {/* ───────────────── Their tickets ───────────────── */}
      <section data-tour="support-view" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Your tickets</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search tickets by ID or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search your tickets"
                className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
              />
            </div>
            <Select
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={STATUS_FILTER_OPTIONS}
              aria-label="Filter tickets by status"
              className="sm:w-44"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-hairline bg-paper">
          {filteredTickets.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={MessageSquare}
                title="No tickets found"
                description={
                  searchQuery || selectedStatus !== "all"
                    ? "Try resetting your search query or status filter."
                    : "You haven't opened any support tickets yet. Use 'Contact support' to get started."
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
                      <td className="max-w-xs truncate px-5 py-4 font-medium text-ink">{t.subject}</td>
                      <td className="px-5 py-4 capitalize text-body">{t.category}</td>
                      <td className="px-5 py-4">{getPriorityBadge(t.priority)}</td>
                      <td className="px-5 py-4">{getStatusBadge(t.status)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-body">
                        {formatDate(t.lastReplyAt ?? t.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link
                          href={`/dashboard/support/${t.id}`}
                          aria-label={`Open ticket ${t.number}`}
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
      </section>

      {/* ───────────────── New ticket composer ───────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-night/50 backdrop-blur-sm"
            onClick={() => !isPending && setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="animate-in fade-in zoom-in-95 relative w-full max-w-lg rounded-2xl border border-hairline bg-paper p-6 shadow-2xl duration-200">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsModalOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X className="size-5" />
            </button>

            <h3 className="mb-4 font-display text-lg font-bold text-ink">Open a Support Ticket</h3>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 p-3.5 text-sm font-semibold text-red-600 dark:text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="subject"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
                >
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
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                  Category
                </span>
                <Select
                  value={category}
                  onChange={setCategory}
                  options={TICKET_CATEGORY_OPTIONS}
                  aria-label="Ticket category"
                />
              </div>

              {requests.length > 0 && (
                <div>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Related service request (optional)
                  </span>
                  <Select
                    value={requestId}
                    onChange={setRequestId}
                    searchable={requests.length > 6}
                    options={[
                      { value: "", label: "Not about a specific request" },
                      ...requests.map((r) => ({
                        value: r.id,
                        label: `${r.number} — ${r.serviceName}`,
                      })),
                    ]}
                    aria-label="Related service request"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="message"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
                >
                  Detailed Message
                </label>
                <textarea
                  id="message"
                  rows={5}
                  placeholder="Describe your request in detail. Attachments or screenshots can be shared by pasting links if needed."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isPending}
                  className="w-full resize-none rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-body transition-colors hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 keep-brand"
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
