"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Send,
  Loader2,
  Trash2,
  Inbox,
  Table2,
  LifeBuoy,
  ChevronLeft,
} from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import { useToast } from "@/components/admin/ui/toaster";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  statusMeta,
  priorityMeta,
  categoryLabel,
} from "@/lib/helpdesk/config";
import {
  createTicketAction,
  replyTicketAction,
  setTicketStatusAction,
  setTicketPriorityAction,
  assignTicketAction,
  deleteTicketAction,
  bulkDeleteTicketsAction,
  bulkSetTicketStatusAction,
  bulkSetTicketPriorityAction,
  type NewTicketInput,
} from "@/app/admin/help-desk/actions";
import type { TicketRow, TicketMessageRow } from "@/lib/db/queries/tickets";
import { cn } from "@/lib/utils";

/* ---- helpers ---- */
function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || src.slice(0, 2).toUpperCase();
}
const AVATAR_TONES = ["bg-blue-500/15 text-blue-600", "bg-emerald-500/15 text-emerald-600", "bg-amber-500/15 text-amber-600", "bg-purple-500/15 text-purple-600", "bg-rose-500/15 text-rose-600"];
function tone(seed: string) {
  let h = 0;
  for (const c of seed) h = (h + c.charCodeAt(0)) % AVATAR_TONES.length;
  return AVATAR_TONES[h];
}
function ago(d: Date | string | null) {
  if (!d) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function when(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const selectCls = "h-8 rounded-lg border border-hairline bg-paper px-2 text-xs font-medium text-ink outline-none focus:border-brand";

const EMPTY_TICKET: NewTicketInput = { subject: "", requesterName: "", requesterEmail: "", priority: "normal", category: "general", message: "" };

export function HelpDeskView({ tickets, messages }: { tickets: TicketRow[]; messages: TicketMessageRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<"inbox" | "table">("inbox");
  const [statusTab, setStatusTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(tickets[0]?.id ?? null);
  const [reply, setReply] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<NewTicketInput>(EMPTY_TICKET);
  const [showThreadMobile, setShowThreadMobile] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);

  function toggleTicketSelect(id: string) {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAllTickets(filteredTickets: TicketRow[]) {
    const allFilteredIds = filteredTickets.map((t) => t.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedTicketIds.includes(id));
    if (areAllSelected) {
      setSelectedTicketIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedTicketIds((prev) => {
        const next = [...prev];
        for (const id of allFilteredIds) {
          if (!next.includes(id)) next.push(id);
        }
        return next;
      });
    }
  }


  const msgByTicket = useMemo(() => {
    const m = new Map<string, TicketMessageRow[]>();
    for (const msg of messages) {
      const arr = m.get(msg.ticketId) || [];
      arr.push(msg);
      m.set(msg.ticketId, arr);
    }
    return m;
  }, [messages]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tickets.length };
    for (const s of TICKET_STATUSES) c[s.key] = tickets.filter((t) => t.status === s.key).length;
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusTab !== "all" && t.status !== statusTab) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (needle && !`${t.number} ${t.subject} ${t.requesterName || ""} ${t.requesterEmail || ""} ${t.assignee || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tickets, statusTab, priorityFilter, categoryFilter, q]);

  const selected = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId]);
  const thread = selected ? msgByTicket.get(selected.id) || [] : [];

  function pick(id: string) {
    setSelectedId(id);
    setReply("");
    setShowThreadMobile(true);
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      if (res.error) toast.success(res.error);
      else if (ok) toast.success(ok);
      router.refresh();
    } else toast.error(res.error || "Action failed.");
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy("reply");
    const res = await replyTicketAction(selected.id, reply, notify);
    setBusy(null);
    if (res.ok) {
      toast.success(res.error || "Reply sent.");
      setReply("");
      router.refresh();
    } else toast.error(res.error || "Could not send.");
  }

  async function createTicket() {
    if (!draft.subject.trim()) {
      toast.error("Add a subject.");
      return;
    }
    setBusy("create");
    const res = await createTicketAction(draft);
    setBusy(null);
    if (res.ok) {
      toast.success("Ticket created.");
      setNewOpen(false);
      setDraft(EMPTY_TICKET);
      if (res.id) setSelectedId(res.id);
      router.refresh();
    } else toast.error(res.error || "Could not create ticket.");
  }

  const StatusTabs = (
    <div className="no-scrollbar flex gap-1 overflow-x-auto">
      {[{ key: "all", label: "All" }, ...TICKET_STATUSES].map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => setStatusTab(s.key)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            statusTab === s.key ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "text-body hover:bg-surface",
          )}
        >
          {s.label}
          <span className={cn("rounded-full px-1.5 text-xs", statusTab === s.key ? "bg-white/20" : "bg-surface text-muted")}>{counts[s.key] ?? 0}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-hairline bg-paper p-1">
          <button type="button" onClick={() => setView("inbox")} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", view === "inbox" ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "text-body hover:text-ink")}>
            <Inbox className="size-4" /> Inbox
          </button>
          <button type="button" onClick={() => setView("table")} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", view === "table" ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "text-body hover:text-ink")}>
            <Table2 className="size-4" /> Table
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets…" className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none focus:border-brand" />
          </div>
          <button type="button" onClick={() => setNewOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover">
            <Plus className="size-4" /> <span className="hidden sm:inline">New ticket</span>
          </button>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline bg-paper px-6 py-16 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-tint text-brand">
            <LifeBuoy className="size-6" />
          </div>
          <h3 className="font-display text-lg font-semibold text-ink">No tickets yet</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-body">Log a support request with “New ticket”, or wire your contact form to open tickets here.</p>
        </div>
      ) : view === "inbox" ? (
        /* ================= INBOX ================= */
        <div className="grid overflow-hidden rounded-card border border-hairline bg-paper lg:grid-cols-[minmax(0,360px)_1fr]">
          {/* List */}
          <div className={cn("border-hairline lg:border-r", showThreadMobile && "hidden lg:block")}>
            <div className="border-b border-hairline px-3 py-2.5">{StatusTabs}</div>
            <div className="max-h-[70vh] divide-y divide-hairline overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-body">No tickets match.</p>
              ) : (
                filtered.map((t) => {
                  const sm = statusMeta(t.status);
                  const active = t.id === selectedId;
                  const last = (msgByTicket.get(t.id) || []).slice(-1)[0];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t.id)}
                      className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors", active ? "bg-brand-tint/60" : "hover:bg-surface/60")}
                    >
                      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold dark:text-white", tone(t.requesterName || t.number))}>
                        {initials(t.requesterName, t.requesterEmail)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{t.requesterName || t.requesterEmail || "Unknown"}</span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", sm.pill)}>{sm.label}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-body">{t.subject}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{last ? last.body : t.number} · {ago(t.lastReplyAt || t.createdAt)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={cn("flex min-h-[60vh] flex-col", !showThreadMobile && "hidden lg:flex")}>
            {selected ? (
              <>
                <div className="border-b border-hairline px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => setShowThreadMobile(false)} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink lg:hidden">
                        <ChevronLeft className="size-3.5" /> All tickets
                      </button>
                      <h3 className="truncate font-display text-base font-bold text-ink">{selected.subject}</h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {selected.number} · {selected.requesterName || selected.requesterEmail || "Unknown"} · Created {ago(selected.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => run("del", () => deleteTicketAction(selected.id), "Ticket deleted.")}
                      disabled={busy === "del"}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Delete ticket"
                    >
                      {busy === "del" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select value={selected.status} onChange={(e) => run("st", () => setTicketStatusAction(selected.id, e.target.value))} className={selectCls}>
                      {TICKET_STATUSES.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                    <select value={selected.priority} onChange={(e) => run("pr", () => setTicketPriorityAction(selected.id, e.target.value))} className={selectCls}>
                      {TICKET_PRIORITIES.map((p) => (
                        <option key={p.key} value={p.key}>{p.label} priority</option>
                      ))}
                    </select>
                    <input
                      defaultValue={selected.assignee || ""}
                      key={selected.id + (selected.assignee || "")}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (selected.assignee || "")) run("as", () => assignTicketAction(selected.id, e.target.value));
                      }}
                      placeholder="Assign to…"
                      className={cn(selectCls, "w-28")}
                    />
                    <span className="ml-auto text-xs text-muted">{categoryLabel(selected.category)}</span>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-4 overflow-y-auto bg-cloud/40 px-5 py-5" style={{ maxHeight: "48vh" }}>
                  {thread.length === 0 && <p className="text-center text-sm text-muted">No messages yet.</p>}
                  {thread.map((m) => {
                    const agent = m.authorRole === "agent";
                    return (
                      <div key={m.id} className={cn("flex gap-2.5", agent && "flex-row-reverse")}>
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold dark:text-white", agent ? "bg-brand text-white" : tone(m.authorName || "?"))}>
                          {agent ? "LC" : initials(m.authorName)}
                        </span>
                        <div className={cn("max-w-[78%] rounded-2xl px-4 py-2.5 text-sm", agent ? "rounded-tr-sm bg-brand text-white" : "rounded-tl-sm border border-hairline bg-paper text-ink")}>
                          <p className={cn("mb-1 text-[11px] font-semibold", agent ? "text-white/80" : "text-muted")}>{m.authorName || (agent ? "Litch Consulting" : "Requester")} · {when(m.createdAt)}</p>
                          <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply */}
                <div className="border-t border-hairline p-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder={`Reply to ${selected.requesterName || "requester"}…`}
                    className="w-full resize-none rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-body">
                      <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 rounded border-hairline accent-brand" />
                      Email the requester{selected.requesterEmail ? "" : " (no email on file)"}
                    </label>
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={busy === "reply" || !reply.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                      {busy === "reply" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send reply
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted">Select a ticket to view the conversation.</div>
            )}
          </div>
        </div>
      ) : (
        /* ================= TABLE ================= */
        <div className="space-y-3">
          {selectedTicketIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <LifeBuoy className="size-4 text-brand" />
                <span>{selectedTicketIds.length} tickets selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  disabled={busy === "bulk"}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val) {
                      setBusy("bulk");
                      const res = await bulkSetTicketStatusAction(selectedTicketIds, val);
                      setBusy(null);
                      if (res.ok) {
                        toast.success("Statuses updated.");
                        setSelectedTicketIds([]);
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to update statuses.");
                      }
                    }
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-semibold text-ink outline-none cursor-pointer"
                >
                  <option value="" disabled>Change Status...</option>
                  {TICKET_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>

                <select
                  defaultValue=""
                  disabled={busy === "bulk"}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val) {
                      setBusy("bulk");
                      const res = await bulkSetTicketPriorityAction(selectedTicketIds, val);
                      setBusy(null);
                      if (res.ok) {
                        toast.success("Priorities updated.");
                        setSelectedTicketIds([]);
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to update priorities.");
                      }
                    }
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-semibold text-ink outline-none cursor-pointer"
                >
                  <option value="" disabled>Change Priority...</option>
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={busy === "bulk"}
                  onClick={async () => {
                    if (confirm(`Delete ${selectedTicketIds.length} selected tickets?`)) {
                      setBusy("bulk");
                      const res = await bulkDeleteTicketsAction(selectedTicketIds);
                      setBusy(null);
                      if (res.ok) {
                        toast.success("Tickets deleted.");
                        setSelectedTicketIds([]);
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to delete tickets.");
                      }
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100/50 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 cursor-pointer"
                >
                  {busy === "bulk" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {StatusTabs}
            <div className="ml-auto flex items-center gap-2">
              <select value={priorityFilter} onChange={(e) => { setQ(""); setPriorityFilter(e.target.value); }} className={cn(selectCls, "h-9")}>
                <option value="all">All priorities</option>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
              <select value={categoryFilter} onChange={(e) => { setQ(""); setCategoryFilter(e.target.value); }} className={cn(selectCls, "h-9")}>
                <option value="all">All categories</option>
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-card border border-hairline bg-paper">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((t) => selectedTicketIds.includes(t.id))}
                      onChange={() => toggleAllTickets(filtered)}
                      className="size-4 rounded border-hairline text-brand accent-brand cursor-pointer focus:ring-brand"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Ticket</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Requester</th>
                  <th className="px-4 py-3 font-semibold">Assigned</th>
                  <th className="px-4 py-3 font-semibold">Updated</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-body">No tickets match.</td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const pm = priorityMeta(t.priority);
                    const sm = statusMeta(t.status);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => {
                          setView("inbox");
                          pick(t.id);
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface/50"
                      >
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTicketIds.includes(t.id)}
                            onChange={() => toggleTicketSelect(t.id)}
                            className="size-4 rounded border-hairline text-brand accent-brand cursor-pointer focus:ring-brand"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{t.subject}</p>
                          <p className="text-xs text-muted">{t.number}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-ink">
                            <span className="size-2 rounded-full" style={{ background: pm.dot }} /> {pm.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-body">{categoryLabel(t.category)}</td>
                        <td className="px-4 py-3 text-body">{t.requesterName || t.requesterEmail || "—"}</td>
                        <td className="px-4 py-3">
                          {t.assignee ? <span className="text-ink">{t.assignee}</span> : <span className="italic text-muted">Not assigned</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted">{ago(t.lastReplyAt || t.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", sm.pill)}>{sm.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New ticket modal */}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New ticket"
        description="Log a support request from a call, email or walk-in."
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setNewOpen(false)} className="rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface">Cancel</button>
            <button type="button" onClick={createTicket} disabled={busy === "create"} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60">
              {busy === "create" && <Loader2 className="size-4 animate-spin" />} Create ticket
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-body">Subject</label>
            <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Brief summary of the issue" className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Requester name</label>
              <input value={draft.requesterName} onChange={(e) => setDraft((d) => ({ ...d, requesterName: e.target.value }))} className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Requester email</label>
              <input type="email" value={draft.requesterEmail} onChange={(e) => setDraft((d) => ({ ...d, requesterEmail: e.target.value }))} className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Priority</label>
              <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand">
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Category</label>
              <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand">
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">Message</label>
            <textarea value={draft.message} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))} rows={4} placeholder="What did the client ask for?" className="w-full resize-y rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
