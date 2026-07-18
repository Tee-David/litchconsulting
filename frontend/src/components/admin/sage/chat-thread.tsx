"use client";

import { useState, useRef, useEffect, type ComponentPropsWithoutRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  FileText,
  Check,
  X,
  ListChecks,
  Activity,
  Paperclip,
  Mic,
  Lightbulb,
  Copy,
  Users,
  Receipt,
  Wand2,
  AlertTriangle,
  History,
  Search,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Select } from "@/components/ui/select";
import { SageIcon } from "@/components/admin/sage-icon";
import { useToast } from "@/components/admin/ui/toaster";
import { formatDateTime } from "@/lib/format-date";
import type { AssistantProposal, AssistantResponse } from "@/lib/litchai/client";
import type { SageConversation } from "@/lib/db/schema";
import {
  applyAssistantProposalAction,
  listSageConversationsAction,
  loadSageConversationAction,
  beginSageTurnAction,
  finishSageTurnAction,
  renameSageConversationAction,
  deleteSageConversationAction,
} from "@/app/admin/sage/actions";

const MAX_CHARS = 3000;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  tool?: string;
  toolResult?: Record<string, unknown> | null;
  proposal?: AssistantProposal | null;
};

type Client = { id: string; name: string | null; company: string | null };

/** Finance-tailored starter prompts. `scope: "client"` flips the selector too. */
const STARTERS: {
  icon: typeof Users;
  tint: string;
  label: string;
  prompt: string;
  scope?: "client";
}[] = [
  {
    icon: Users,
    tint: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    label: "Ask about a client",
    prompt: "Summarise this client's latest financial position.",
    scope: "client",
  },
  {
    icon: Receipt,
    tint: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    label: "Tax & compliance",
    prompt: "What VAT rate applies to professional services under the NTA 2025?",
  },
  {
    icon: Activity,
    tint: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    label: "Pipeline health",
    prompt: "How many documents are awaiting review right now?",
  },
  {
    icon: Wand2,
    tint: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    label: "Explain a figure",
    prompt: "Explain how the total revenue figure was derived.",
  },
];

const BROWSE_PROMPTS = [
  ...STARTERS.map((s) => s.prompt),
  "Draft a short note to a client about an overdue invoice.",
  "What is our total outstanding receivables this quarter?",
];

/** Markdown renderer for assistant replies — styled inline so it reads well
 *  without the Tailwind typography plugin (finance answers use lists, bold,
 *  code and the occasional table). */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (p) => <p className="mb-2 last:mb-0" {...p} />,
          ul: (p) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0" {...p} />,
          ol: (p) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0" {...p} />,
          li: (p) => <li className="pl-0.5" {...p} />,
          strong: (p) => <strong className="font-semibold text-ink" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          a: (p) => <a className="font-medium text-brand underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />,
          h1: (p) => <h3 className="mb-1.5 mt-3 font-display text-base font-bold text-ink first:mt-0" {...p} />,
          h2: (p) => <h3 className="mb-1.5 mt-3 font-display text-base font-bold text-ink first:mt-0" {...p} />,
          h3: (p) => <h4 className="mb-1 mt-2.5 font-semibold text-ink first:mt-0" {...p} />,
          code: ({ className, ...rest }: ComponentPropsWithoutRef<"code">) =>
            /language-/.test(className || "") ? (
              <code className="font-mono text-[13px]" {...rest} />
            ) : (
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-ink" {...rest} />
            ),
          pre: (p) => (
            <pre className="mb-2 overflow-x-auto rounded-xl border border-hairline bg-surface p-3 text-[13px] last:mb-0" {...p} />
          ),
          blockquote: (p) => <blockquote className="border-l-2 border-hairline pl-3 text-body" {...p} />,
          table: (p) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-hairline bg-surface px-2 py-1 text-left font-semibold" {...p} />,
          td: (p) => <td className="border border-hairline px-2 py-1" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Pulsating streaming indicator — three dots that breathe while awaiting a reply. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1.5 py-1" role="status" aria-label="Sage is thinking">
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          className="size-2 rounded-full bg-brand/70 animate-[pulse_1.2s_ease-in-out_infinite] motion-reduce:animate-none dark:bg-white/70"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Sage runs a local model on our own VM. A warm reply lands in a few seconds,
 * but the first request after an idle spell loads the model and has been
 * measured at ~77s. Silence that long reads as "broken", so escalate an
 * explanation the longer it takes rather than leaving the user guessing.
 */
function WaitingNote({ seconds }: { seconds: number }) {
  const note =
    seconds >= 40
      ? "Still warming up — almost there. The model loads once, then replies are quick."
      : seconds >= 12
        ? "Sage is starting up. The first question after a quiet spell loads the model, which can take up to a minute."
        : null;
  if (!note) return null;
  return (
    <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">
      {note} <span className="tabular-nums opacity-70">({seconds}s)</span>
    </p>
  );
}

/** Compact grounded-data card for a READ tool's structured result. */
function ToolCard({ tool, data }: { tool?: string; data: Record<string, unknown> }) {
  if (tool === "list_analyses" && Array.isArray(data.documents)) {
    const docs = data.documents as { document_id: number; filename: string; status: string }[];
    if (docs.length === 0) return null;
    return (
      <div className="mt-3 rounded-xl border border-hairline bg-paper p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <ListChecks className="size-3.5" /> {String(data.count ?? docs.length)} document(s)
        </p>
        <ul className="space-y-1">
          {docs.slice(0, 8).map((d) => (
            <li key={d.document_id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-body">{d.filename}</span>
              <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                {d.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (tool === "document_status" && data.filename) {
    return (
      <div className="mt-3 rounded-xl border border-hairline bg-paper p-3 text-xs">
        <p className="font-semibold text-ink">{String(data.filename)}</p>
        <p className="mt-1 text-body">
          Status: <span className="font-medium">{String(data.status)}</span>
          {data.progress != null && ` · ${String(data.progress)}%`}
        </p>
      </div>
    );
  }

  if (tool === "pipeline_health") {
    const entries = Object.entries(data).filter(([, v]) => typeof v === "number");
    if (entries.length === 0) return null;
    return (
      <div className="mt-3 rounded-xl border border-hairline bg-paper p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Activity className="size-3.5" /> Pipeline
        </p>
        <div className="grid grid-cols-2 gap-2">
          {entries.slice(0, 6).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted">{k.replace(/_/g, " ")}</p>
              <p className="text-sm font-semibold tabular-nums text-ink">{String(v)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/** Search + list of saved conversations. Shared by the desktop rail and the
 *  mobile drawer — same markup, different wrapper. Rename/delete controls are
 *  always visible (not hover-gated) so they work on touch, not just mouse. */
function HistoryPanel({
  conversations,
  activeId,
  query,
  loading,
  onQueryChange,
  onSelect,
  onNew,
  renamingId,
  renameDraft,
  onRenameStart,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: {
  conversations: SageConversation[];
  activeId: string | null;
  query: string;
  loading: boolean;
  onQueryChange: (v: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  renamingId: string | null;
  renameDraft: string;
  onRenameStart: (id: string, title: string) => void;
  onRenameDraftChange: (v: string) => void;
  onRenameSubmit: (id: string) => void;
  onRenameCancel: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button size="sm" variant="outline" className="w-full justify-center gap-2" onClick={onNew}>
          <Plus className="size-4" /> New chat
        </Button>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-lg border border-hairline bg-surface py-1.5 pl-8 pr-2 text-xs text-ink outline-none placeholder:text-muted focus:border-brand"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <p className="px-2 py-4 text-center text-xs text-muted">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted">
            {query ? "No matches." : "No conversations yet."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                {renamingId === c.id ? (
                  <div className="flex items-center gap-1 px-1 py-1">
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => onRenameDraftChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRenameSubmit(c.id);
                        if (e.key === "Escape") onRenameCancel();
                      }}
                      className="min-w-0 flex-1 rounded-md border border-brand bg-paper px-1.5 py-1 text-xs text-ink outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onRenameSubmit(c.id)}
                      className="shrink-0 rounded p-1 text-muted hover:text-brand"
                      aria-label="Save title"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onRenameCancel}
                      className="shrink-0 rounded p-1 text-muted hover:text-ink"
                      aria-label="Cancel"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-0.5 rounded-lg pl-2 pr-1",
                      c.id === activeId ? "bg-brand-tint" : "hover:bg-surface",
                    )}
                  >
                    <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 py-1.5 text-left">
                      <p className={cn("truncate text-sm", c.id === activeId ? "font-semibold text-brand" : "text-ink")}>
                        {c.title}
                      </p>
                      <p className="truncate text-[11px] text-muted">{formatDateTime(c.updatedAt)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRenameStart(c.id, c.title)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                      aria-label="Rename"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(c.id)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ChatThread({ clients }: { clients: Client[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<"firm" | "client">("firm");
  const [clientId, setClientId] = useState("");
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [showPrompts, setShowPrompts] = useState(false);
  const [offline, setOffline] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);

  // Conversation history — persisted per admin user, searchable.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<SageConversation[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function refreshHistory(query: string) {
    setHistoryLoading(true);
    try {
      const res = await listSageConversationsAction(query);
      if (res.ok) setConversations(res.conversations);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Instant on mount, debounced while the admin types a search.
  useEffect(() => {
    const t = setTimeout(() => void refreshHistory(historyQuery), historyQuery ? 300 : 0);
    return () => clearTimeout(t);
  }, [historyQuery]);

  // Restore the conversation named in the URL (?c=…) on first load, so a
  // refresh or returning from another page continues where you left off.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("c");
    if (id) void selectConversation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-grow the composer with its content (capped), so multi-line prompts
  // don't hide behind a fixed one-row box.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Tick a counter while a reply is in flight, so WaitingNote can explain a
  // cold start instead of leaving the user staring at silent dots.
  useEffect(() => {
    if (!loading) {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => setWaited(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function applyStarter(s: (typeof STARTERS)[number]) {
    if (s.scope) setScope(s.scope);
    setInput(s.prompt);
    setShowPrompts(false);
    focusInput();
  }

  // Keep the active conversation in the URL (?c=…) so a refresh or a trip to
  // another page and back restores the thread instead of dropping you on a
  // blank chat. history.replaceState avoids a server round-trip.
  function setActiveConversation(id: string | null) {
    setConversationId(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", id ? `/admin/sage?c=${id}` : "/admin/sage");
    }
  }

  function newChat() {
    setMessages([]);
    setActiveConversation(null);
    setOffline(null);
    setHistoryOpen(false);
    focusInput();
  }

  async function selectConversation(id: string) {
    setHistoryOpen(false);
    const res = await loadSageConversationAction(id);
    if (!res.ok || !res.conversation) {
      toast.error(res.error || "Could not open that conversation.");
      return;
    }
    setActiveConversation(id);
    setScope(res.conversation.scope === "client" ? "client" : "firm");
    setClientId(res.conversation.clientId || "");
    setMessages(
      (res.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        citations: Array.isArray(m.citations) ? (m.citations as string[]) : undefined,
      })),
    );
  }

  async function removeConversation(id: string) {
    if (!confirm("Delete this conversation? This can't be undone.")) return;
    const res = await deleteSageConversationAction(id);
    if (!res.ok) return toast.error(res.message);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (conversationId === id) newChat();
  }

  async function submitRename(id: string) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const res = await renameSageConversationAction(id, title);
    if (!res.ok) return toast.error(res.message);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (scope === "client" && !clientId) {
      toast.error("Pick a client first, or switch the scope to the firm knowledge base.");
      return;
    }

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowPrompts(false);
    setOffline(null);
    setLoading(true);

    // Persist the question up front so it survives a slow/cut-off reply or a
    // navigation away, and so the conversation appears in history immediately.
    const begun = await beginSageTurnAction({
      conversationId,
      scope,
      clientId: scope === "client" ? clientId : null,
      userMessage: text,
    });
    let activeId = conversationId;
    if (begun.ok) {
      activeId = begun.conversationId;
      if (!conversationId) setActiveConversation(begun.conversationId);
      void refreshHistory(historyQuery);
    }

    try {
      const res = await fetch("/api/sage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          scope,
          clientId: scope === "client" ? clientId : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || "Sage relay failed";
        if (res.status === 503) setOffline(msg);
        throw new Error(msg);
      }

      const payload = data as AssistantResponse;
      const answer = payload.answer || "I'm not sure how to respond to that.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer,
          citations: payload.citations,
          tool: payload.tool,
          toolResult: payload.tool_result,
          proposal: payload.proposal,
        },
      ]);

      if (activeId) {
        void finishSageTurnAction({
          conversationId: activeId,
          assistantMessage: answer,
          citations: payload.citations,
        }).then(() => void refreshHistory(historyQuery));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get a response");
    } finally {
      setLoading(false);
    }
  }

  async function confirmProposal(msgId: string, proposal: AssistantProposal) {
    setApplying(msgId);
    try {
      const result = await applyAssistantProposalAction(proposal);
      if (result.ok) {
        toast.success(result.message);
        setAppliedIds((prev) => new Set(prev).add(msgId));
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply the proposal.");
    } finally {
      setApplying(null);
    }
  }

  const empty = messages.length === 0;

  const historyProps = {
    conversations,
    activeId: conversationId,
    query: historyQuery,
    loading: historyLoading,
    onQueryChange: setHistoryQuery,
    onSelect: (id: string) => void selectConversation(id),
    onNew: newChat,
    renamingId,
    renameDraft,
    onRenameStart: (id: string, title: string) => {
      setRenamingId(id);
      setRenameDraft(title);
    },
    onRenameDraftChange: setRenameDraft,
    onRenameSubmit: (id: string) => void submitRename(id),
    onRenameCancel: () => setRenamingId(null),
    onDelete: (id: string) => void removeConversation(id),
  };

  return (
    <div className="flex h-full">
      {/* Desktop history rail */}
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-surface/30 md:flex md:flex-col">
        <HistoryPanel {...historyProps} />
      </aside>

      {/* Mobile history drawer */}
      <AnimatePresence>
        {historyOpen && (
          <div className="fixed inset-0 z-[80] md:hidden">
            <motion.div
              className="absolute inset-0 bg-night/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-hairline bg-paper"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
                <span className="text-sm font-semibold text-ink">History</span>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
                >
                  <X className="size-4.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <HistoryPanel {...historyProps} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Scope bar — stacks full-width on phones, inline on ≥sm */}
        <div className="flex flex-col gap-2 border-b border-hairline bg-surface/40 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open conversation history"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-hairline text-body transition-colors hover:bg-surface hover:text-ink md:hidden"
          >
            <History className="size-4.5" />
          </button>
          <span className="text-sm font-semibold text-ink">Scope</span>
          <div className="w-full sm:w-48">
            <Select
              value={scope}
              onChange={(v) => setScope(v as "firm" | "client")}
              aria-label="Knowledge scope"
              options={[
                { value: "firm", label: "Firm knowledge base" },
                { value: "client", label: "Client documents" },
              ]}
            />
          </div>
          {scope === "client" && (
            <div className="w-full sm:w-64">
              <Select
                value={clientId}
                onChange={setClientId}
                searchable
                placeholder="Select a client…"
                aria-label="Client"
                options={clients.map((c) => ({
                  value: c.id,
                  label: c.company || c.name || "Unknown",
                }))}
              />
            </div>
          )}
        </div>

      {/* Messages / welcome */}
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
              <SageIcon className="size-7" />
            </div>
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Welcome to Sage</h2>
            <p className="mt-2 max-w-md text-sm text-body">
              Ask about firm knowledge, Nigerian tax rules, or a specific client&apos;s documents.
              Not sure where to start?
            </p>
            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => applyStarter(s)}
                  className="group flex items-center gap-3 rounded-2xl border border-hairline bg-paper p-4 text-left transition-colors hover:border-brand/40 hover:bg-surface/50"
                >
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", s.tint)}>
                    <s.icon className="size-4.5" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-ink">{s.label}</span>
                  <span className="text-muted transition-colors group-hover:text-brand">
                    <ArrowUp className="size-4 rotate-45" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="space-y-2">
                  <AssistantMarkdown content={m.content} />

                  {m.toolResult && <ToolCard tool={m.tool} data={m.toolResult} />}

                  {m.proposal && (
                    <div className="rounded-xl border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Proposed action — confirm to apply
                      </p>
                      <p className="mt-1 text-sm text-ink">{m.proposal.summary}</p>
                      {m.proposal.ready && !appliedIds.has(m.id) && (
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            loading={applying === m.id}
                            onClick={() => confirmProposal(m.id, m.proposal!)}
                          >
                            <Check className="size-3.5" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={applying === m.id}
                            onClick={() => setAppliedIds((prev) => new Set(prev).add(m.id))}
                          >
                            <X className="size-3.5" /> Dismiss
                          </Button>
                        </div>
                      )}
                      {appliedIds.has(m.id) && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <Check className="size-3.5" /> Handled
                        </p>
                      )}
                    </div>
                  )}

                  {m.citations && m.citations.length > 0 && (
                    <div className="space-y-1.5 border-t border-hairline pt-3">
                      <p className="text-xs font-semibold text-muted">Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {m.citations.map((ref, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md border border-hairline bg-paper px-2 py-1 text-[11px] text-body"
                          >
                            <FileText className="size-3" />
                            {ref}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Copy answer"
                      onClick={() => {
                        void navigator.clipboard.writeText(m.content);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div>
                <TypingDots />
                <WaitingNote seconds={waited} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-hairline bg-paper px-3 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-3xl">
          {offline && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{offline}</span>
            </div>
          )}

          <div className="relative rounded-2xl border border-hairline bg-surface transition-colors focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
            {showPrompts && (
              <div className="absolute bottom-full left-0 mb-2 w-full max-w-md rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/10">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Example prompts
                </p>
                {BROWSE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setInput(p);
                      setShowPrompts(false);
                      focusInput();
                    }}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-body transition-colors hover:bg-surface hover:text-ink"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 p-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                maxLength={MAX_CHARS}
                placeholder="Ask Sage anything…"
                className="max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted"
                rows={1}
              />
              <Button
                size="icon"
                aria-label="Send message"
                disabled={!input.trim() || loading}
                onClick={() => void send()}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1 border-t border-hairline px-2 py-1.5">
              <Button
                size="xs"
                variant="ghost"
                className="text-muted"
                title="Attaching documents is coming soon"
                onClick={() => toast.toast("Document attachments are coming soon.", "info")}
              >
                <Paperclip className="size-3.5" /> <span className="hidden xs:inline">Attach</span>
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="text-muted"
                title="Voice messages are coming soon"
                onClick={() => toast.toast("Voice messages are coming soon.", "info")}
              >
                <Mic className="size-3.5" /> <span className="hidden xs:inline">Voice</span>
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="text-muted"
                aria-expanded={showPrompts}
                onClick={() => setShowPrompts((s) => !s)}
              >
                <Lightbulb className="size-3.5" /> <span className="hidden xs:inline">Browse prompts</span>
              </Button>
              <span className="ml-auto pr-1 text-[11px] tabular-nums text-muted">
                {input.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
          </div>

          <p className="mt-2 text-center text-[11px] text-muted">
            Sage may be inaccurate — verify against source documents. Grounded in the firm knowledge base.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
