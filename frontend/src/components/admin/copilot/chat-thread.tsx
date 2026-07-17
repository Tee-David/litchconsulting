"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, User, Send, Loader2, FileText, Check, X, ListChecks, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import type { AssistantProposal, AssistantResponse } from "@/lib/litchai/client";
import { applyAssistantProposalAction } from "@/app/admin/assistant/actions";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  tool?: string;
  toolResult?: Record<string, unknown> | null;
  proposal?: AssistantProposal | null;
  canAnswer?: boolean;
};

type Client = {
  id: string;
  name: string | null;
  company: string | null;
};

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

  const bottomRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (scope === "client" && !clientId) {
      toast.error("Please select a client first");
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          scope,
          clientId: scope === "client" ? clientId : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text().catch(() => "Copilot relay failed"));
      }

      const data: AssistantResponse = await res.json();
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || "I'm not sure how to respond to that.",
        citations: data.citations,
        tool: data.tool,
        toolResult: data.tool_result,
        proposal: data.proposal,
        canAnswer: data.can_answer,
      };
      setMessages((prev) => [...prev, assistantMsg]);
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-hairline bg-surface/50 p-4">
        <label className="text-sm font-semibold text-ink">Scope:</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "firm" | "client")}
          className="rounded-lg border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="firm">Firm Knowledge Base</option>
          <option value="client">Client Documents</option>
        </select>

        {scope === "client" && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-hairline bg-paper px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="">Select a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company || c.name || "Unknown"}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
              <Bot className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-ink">LitchAI Copilot</h3>
            <p className="mt-2 max-w-md text-sm text-body">
              Ask about firm knowledge, tax codes, or query a specific client&apos;s financial documents.
            </p>
          </div>
        ) : (
          messages.map((m) => (
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

                {m.role === "assistant" && m.toolResult && (
                  <ToolCard tool={m.tool} data={m.toolResult} />
                )}

                {m.role === "assistant" && m.proposal && (
                  <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Proposed action — confirm to apply
                    </p>
                    <p className="mt-1 text-sm text-ink">{m.proposal.summary}</p>
                    {m.proposal.ready && !appliedIds.has(m.id) && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => confirmProposal(m.id, m.proposal!)}
                          disabled={applying === m.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                        >
                          {applying === m.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          Confirm
                        </button>
                        <button
                          onClick={() => setAppliedIds((prev) => new Set(prev).add(m.id))}
                          disabled={applying === m.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-paper disabled:opacity-50"
                        >
                          <X className="size-3.5" /> Dismiss
                        </button>
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
                    <p className="text-xs font-semibold text-muted">Sources:</p>
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
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex max-w-[85%] gap-4">
            <div className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-brand">
              <Bot className="size-4" />
            </div>
            <div className="flex items-center rounded-2xl border border-hairline bg-surface px-4 py-3">
              <Loader2 className="size-4 animate-spin text-muted" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-hairline bg-paper p-4">
        <form
          onSubmit={onSubmit}
          className="relative flex items-end gap-2 overflow-hidden rounded-xl border border-hairline bg-surface p-2 shadow-sm transition-all focus-within:border-brand focus-within:ring-1 focus-within:ring-brand"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSubmit(e);
              }
            }}
            placeholder="Ask Copilot anything..."
            className="max-h-32 min-h-10 w-full resize-none bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-muted"
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
