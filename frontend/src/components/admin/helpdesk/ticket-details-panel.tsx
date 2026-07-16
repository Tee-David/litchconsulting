"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Plus, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_TEAMS,
  TICKET_TYPES,
  categoryLabel,
  parseTags,
} from "@/lib/helpdesk/config";
import type { TicketRow, TicketMessageRow } from "@/lib/db/queries/tickets";
import { cn } from "@/lib/utils";

type Props = {
  ticket: TicketRow;
  thread: TicketMessageRow[];
  /** Admin roster for the assignee picker. */
  assignees: string[];
  onStatus: (v: string) => void;
  onPriority: (v: string) => void;
  onAssignee: (v: string) => void;
  onTeam: (v: string) => void;
  onType: (v: string) => void;
  onTags: (tags: string[]) => void;
  /** Back to the thread (below xl, where the panes swap). */
  onBack: () => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function Attribute({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium text-ink">{children}</span>
    </div>
  );
}

export function TicketDetailsPanel({
  ticket,
  thread,
  assignees,
  onStatus,
  onPriority,
  onAssignee,
  onTeam,
  onType,
  onTags,
  onBack,
}: Props) {
  const [tagDraft, setTagDraft] = useState("");
  const tags = useMemo(() => parseTags(ticket.tags), [ticket.tags]);

  const assigneeOptions = useMemo(() => {
    const roster = new Set(assignees);
    if (ticket.assignee) roster.add(ticket.assignee);
    return [
      { value: "", label: "Unassigned" },
      ...Array.from(roster)
        .sort((a, b) => a.localeCompare(b))
        .map((a) => ({ value: a, label: a })),
    ];
  }, [assignees, ticket.assignee]);

  /** created → each reply → resolution, oldest first. */
  const timeline = useMemo(() => {
    const steps: { key: string; label: string; at: Date | string | null; tone: string }[] = [
      { key: "created", label: "Ticket created", at: ticket.createdAt, tone: "bg-brand" },
      ...thread.map((m) => ({
        key: m.id,
        label: `${m.authorRole === "agent" ? "Agent" : "Client"} replied — ${m.authorName || "Unknown"}`,
        at: m.createdAt,
        tone: m.authorRole === "agent" ? "bg-emerald-500" : "bg-slate-400",
      })),
    ];
    if (ticket.status === "resolved" || ticket.status === "closed") {
      steps.push({
        key: "resolved",
        label: ticket.status === "resolved" ? "Marked resolved" : "Ticket closed",
        at: ticket.updatedAt,
        tone: "bg-emerald-600",
      });
    }
    return steps;
  }, [ticket.createdAt, ticket.status, ticket.updatedAt, thread]);

  function addTag() {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) {
      setTagDraft("");
      return;
    }
    onTags([...tags, t]);
    setTagDraft("");
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-hairline px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink xl:hidden"
        >
          <ChevronLeft className="size-3.5" /> Conversation
        </button>
        <h3 className="font-display text-sm font-bold text-ink">Details</h3>
      </div>

      <div className="space-y-4 px-4 py-4">
        <Field label="Assignee">
          <Select
            value={ticket.assignee || ""}
            onChange={onAssignee}
            options={assigneeOptions}
            searchable={assigneeOptions.length > 6}
            aria-label="Assignee"
          />
        </Field>

        <Field label="Team">
          <Select
            value={ticket.team || ""}
            onChange={onTeam}
            options={[
              { value: "", label: "No team" },
              ...TICKET_TEAMS.map((t) => ({ value: t.key, label: t.label, hint: t.hint })),
            ]}
            aria-label="Team"
          />
        </Field>

        <Field label="Ticket type">
          <Select
            value={ticket.type || ""}
            onChange={onType}
            options={[
              { value: "", label: "Untyped" },
              ...TICKET_TYPES.map((t) => ({ value: t.key, label: t.label, hint: t.hint })),
            ]}
            aria-label="Ticket type"
          />
        </Field>

        <Field label="Status">
          <Select
            value={ticket.status}
            onChange={onStatus}
            options={TICKET_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
            aria-label="Status"
          />
        </Field>

        <Field label="Priority">
          <Select
            value={ticket.priority}
            onChange={onPriority}
            options={TICKET_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))}
            aria-label="Priority"
          />
        </Field>

        <Field label="Subject">
          <p className="rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink">
            {ticket.subject}
          </p>
        </Field>

        {/* Tags */}
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand"
              >
                {t}
                <button
                  type="button"
                  onClick={() => onTags(tags.filter((x) => x !== t))}
                  aria-label={`Remove tag ${t}`}
                  className="grid size-3.5 place-items-center rounded-full transition-colors hover:bg-brand/20"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {tags.length === 0 && <span className="text-xs text-muted">No tags yet.</span>}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag…"
              aria-label="Add a tag"
              className="h-8 min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-2.5 text-xs text-ink outline-none placeholder:text-muted focus:border-brand"
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!tagDraft.trim()}
              aria-label="Add tag"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-hairline text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </Field>

        {/* Attributes */}
        <div className="rounded-xl border border-hairline bg-surface px-3 py-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
            Attributes
          </span>
          <div className="divide-y divide-hairline">
            <Attribute label="Ticket ID">{ticket.number}</Attribute>
            <Attribute label="Customer">
              <span className="flex items-center justify-end gap-1.5">
                <Avatar name={ticket.requesterName} email={ticket.requesterEmail} size={5} />
                <span className="truncate">
                  {ticket.requesterName || ticket.requesterEmail || "Unknown"}
                </span>
              </span>
            </Attribute>
            {ticket.requesterEmail && (
              <Attribute label="Email">
                <span className="truncate">{ticket.requesterEmail}</span>
              </Attribute>
            )}
            <Attribute label="Category">{categoryLabel(ticket.category)}</Attribute>
            <Attribute label="Date submitted">{formatDate(ticket.createdAt)}</Attribute>
            <Attribute label="Last activity">
              {formatDate(ticket.lastReplyAt ?? ticket.createdAt)}
            </Attribute>
            {ticket.requestId && (
              <Attribute label="Related request">
                <Link
                  href={`/admin/requests/${ticket.requestId}`}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  View request <ExternalLink className="size-3" />
                </Link>
              </Attribute>
            )}
          </div>
        </div>

        {/* Progress timeline */}
        <div>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted">
            Progress
          </span>
          <ol className="space-y-2.5">
            {timeline.map((s, i) => (
              <li key={s.key} className="flex gap-2.5">
                <span className="flex flex-col items-center">
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", s.tone)} />
                  {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-hairline" />}
                </span>
                <span className="min-w-0 pb-0.5">
                  <span className="block text-xs font-medium leading-snug text-ink">{s.label}</span>
                  <span className="block text-[11px] text-muted">{formatDateTime(s.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
