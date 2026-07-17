"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  User,
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
  RefreshCw,
  Users,
  Receipt,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/admin/ui/toaster";
import type { AssistantProposal, AssistantResponse } from "@/lib/litchai/client";
import { applyAssistantProposalAction } from "@/app/admin/assistant/actions";

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

/** Pulsating streaming indicator — three dots that breathe while awaiting a reply. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1.5 py-1" role="status" aria-label="Copilot is thinking">
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function applyStarter(s: (typeof STARTERS)[number]) {
    if (s.scope) setScope(s.scope);
    setInput(s.prompt);
    setShowPrompts(false);
    focusInput();
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

    try {
      const res = await fetch("/api/copilot", {
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
        const msg = data?.error || "Copilot relay failed";
        if (res.status === 503) setOffline(msg);
        throw new Error(msg);
      }

      const payload = data as AssistantResponse;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.answer || "I'm not sure how to respond to that.",
          citations: payload.citations,
          tool: payload.tool,
          toolResult: payload.tool_result,
          proposal: payload.proposal,
        },
      ]);
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
  const overLimit = input.length > MAX_CHARS;

  return (
    <div className="flex h-full flex-col">
      {/* Scope bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-surface/40 px-4 py-3">
        <span className="text-sm font-semibold text-ink">Scope</span>
        <div className="w-48">
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
          <div className="w-64">
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
              <Bot className="size-7" />
            </div>
            <h2 className="font-display text-3xl font-bold text-ink">Welcome to Copilot</h2>
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
          <div className="space-y-6 p-4 sm:p-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex max-w-[85%] gap-4", m.role === "user" ? "ml-auto flex-row-reverse" : "")}
              >
                <div
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    m.role === "user" ? "bg-brand text-white" : "border border-hairline bg-surface text-brand",
                  )}
                >
                  {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div
                  className={cn(
                    "space-y-2 rounded-2xl p-4 text-sm",
                    m.role === "user"
                      ? "bg-brand text-white"
                      : "border border-hairline bg-surface text-ink",
                  )}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>

                  {m.role === "assistant" && m.toolResult && <ToolCard tool={m.tool} data={m.toolResult} />}

                  {m.role === "assistant" && m.proposal && (
                    <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
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

                  {m.role === "assistant" && m.citations && m.citations.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-hairline pt-3">
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

                  {m.role === "assistant" && (
                    <div className="flex items-center gap-1 pt-1">
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
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex max-w-[85%] gap-4">
                <div className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-brand">
                  <Bot className="size-4" />
                </div>
                <div className="flex items-center rounded-2xl border border-hairline bg-surface px-4 py-3">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-hairline bg-paper p-4">
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
              placeholder="Ask Copilot anything…"
              className="max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-muted"
              rows={1}
            />
            <Button
              size="icon"
              aria-label="Send message"
              disabled={!input.trim() || loading || overLimit}
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
              <Paperclip className="size-3.5" /> Attach
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-muted"
              title="Voice messages are coming soon"
              onClick={() => toast.toast("Voice messages are coming soon.", "info")}
            >
              <Mic className="size-3.5" /> Voice
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-muted"
              aria-expanded={showPrompts}
              onClick={() => setShowPrompts((s) => !s)}
            >
              <Lightbulb className="size-3.5" /> Browse prompts
            </Button>
            <span className={cn("ml-auto pr-1 text-[11px] tabular-nums", overLimit ? "text-danger" : "text-muted")}>
              {input.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted">
          Copilot may be inaccurate — verify against source documents. Grounded in the firm knowledge base.
        </p>
      </div>
    </div>
  );
}
