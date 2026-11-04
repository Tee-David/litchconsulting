"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Send } from "lucide-react";
import { Button, EmptyState } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { cn } from "@/lib/utils";

export type ThreadMessage = { id: string; body: string; from: "client" | "firm"; author: string | null; at: string; internal?: boolean };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * A request conversation. `viewer` decides which side is "mine". The firm
 * side can also write internal team notes (never shown to the client).
 */
export function MessageThread({
  messages,
  viewer,
  send,
  placeholder,
  allowInternal = false,
  closed = false,
}: {
  messages: ThreadMessage[];
  viewer: "client" | "firm";
  send: (body: string, internal: boolean) => Promise<{ ok: boolean; error?: string }>;
  placeholder: string;
  allowInternal?: boolean;
  closed?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const text = body.trim();
    if (!text) return setErr("Write a message first.");
    setBusy(true);
    setErr(null);
    try {
      const r = await send(text, internal);
      if (!r.ok) return setErr(r.error ?? "Your message was not sent. Try again.");
      setBody("");
      toast.success(internal ? "Team note saved" : "Message sent");
      router.refresh();
    } catch {
      setErr("Your message was not sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {messages.length === 0 ? (
        <EmptyState compact title="No messages yet" why={viewer === "client" ? "Ask anything about this request. The person working on it answers, usually within a working day." : "When the client writes on this request, it appears here."} />
      ) : (
        <ol className="space-y-4" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.from === viewer;
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className="max-w-[85%]">
                  <div
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
                      m.internal ? "border border-dashed border-violet/40 bg-violet-soft text-ink" : mine ? "bg-act text-act-ink" : "bg-surface text-ink",
                    )}
                  >
                    {m.body}
                  </div>
                  <p className={cn("mt-1 flex items-center gap-1 text-xs text-muted", mine && "justify-end")}>
                    {m.internal ? <Lock className="size-3" aria-label="Team note" /> : null}
                    {m.author || (m.from === "client" ? "Client" : "Litch")} · {fmt(m.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {closed ? (
        <p className="mt-4 text-sm text-muted">This request is closed. Use Support for anything new.</p>
      ) : (
        <div className="mt-5 rounded-card border border-line-strong bg-paper focus-within:border-accent">
          <label className="sr-only" htmlFor="thread-body">{placeholder}</label>
          <textarea
            id="thread-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            rows={3}
            maxLength={4000}
            placeholder={placeholder}
            className="block w-full resize-y rounded-t-card bg-transparent px-3.5 py-3 text-sm text-ink outline-none placeholder:text-faint"
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-3 py-2">
            {allowInternal ? (
              <label className="inline-flex items-center gap-2 text-sm text-body">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-[var(--color-violet)]" />
                Team note (the client does not see it)
              </label>
            ) : null}
            <Button variant="primary" size="sm" className="ml-auto" disabled={busy || !body.trim()} onClick={submit}>
              <Send className="size-3.5" aria-hidden /> {busy ? "Sending…" : internal ? "Save note" : "Send"}
            </Button>
          </div>
          {err ? <p role="alert" className="px-3.5 pb-2 text-sm text-bad">{err}</p> : null}
        </div>
      )}
    </div>
  );
}
