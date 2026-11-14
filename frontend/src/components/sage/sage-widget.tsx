"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Maximize2, SquarePen, X } from "lucide-react";
import { SageIcon } from "@/components/admin/sage-icon";
import { ThreadPicker } from "@/components/sage-ui/thread-picker";
import { STARTERS, type SageRole } from "@/lib/sage/present";
import { SageAnswer, UserBubble, Working } from "./answer";
import { SageComposer } from "./composer";
import { useSageChat } from "./use-sage-chat";

/**
 * D3: the floating Sage. The button opens a minimal panel over the page; Expand
 * opens the same chat in the full Sage page. Hidden where Sage already has a
 * panel (the Sage page and the workbench).
 */
export function SageWidget({ role = "admin", basePath = "/admin/sage" }: { role?: SageRole; basePath?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // History loads only once the panel has been opened (no work on every page view).
  const chat = useSageChat({ role, basePath, syncUrl: false, enabled: open });
  const bottom = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ text: string; key: number } | null>(null);
  const lastAssistantId = [...chat.turns].reverse().find((t) => t.role === "assistant")?.id;

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: "end" });
  }, [open, chat.turns.length, chat.loading]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement | null)?.closest?.("[role=dialog][aria-label='Chat history']")) setOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  if (pathname?.startsWith(basePath) || pathname?.startsWith("/admin/analyses/w/")) return null;

  const expand = () => {
    setOpen(false);
    router.push(chat.conversationId ? `${basePath}?c=${chat.conversationId}` : basePath);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Sage"
        data-tour="sage-fab"
        className="keep-brand fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand pl-2 pr-4 text-[14px] font-medium text-white shadow-lg ring-1 ring-white/10 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none sm:bottom-6 sm:right-6 lg:bottom-6"
      >
        <span className="grid size-8 place-items-center rounded-full bg-white/15">
          <SageIcon className="size-[18px]" />
        </span>
        Ask Sage
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Sage"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100dvh-96px))] sm:w-[400px] sm:rounded-[18px] sm:border sm:border-hairline sm:shadow-2xl motion-safe:animate-[sage-pop_.18s_ease-out]"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-hairline py-1.5 pl-3 pr-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <span className="keep-brand grid size-[26px] shrink-0 place-items-center rounded-lg bg-brand text-white">
          <SageIcon className="size-4" />
        </span>
        <ThreadPicker
          current={{ id: chat.conversationId ?? "new", title: chat.title ?? "New chat", at: null }}
          threads={chat.conversations.map((c) => ({ id: c.id, title: c.title, at: c.updatedAt ? String(c.updatedAt) : null }))}
          onPick={(id) => void chat.select(id)}
          disabled={chat.loading}
        />
        <button type="button" onClick={() => chat.newChat()} disabled={chat.loading || chat.turns.length === 0} className="grid size-9 shrink-0 place-items-center rounded-ctl text-body hover:bg-surface hover:text-ink disabled:opacity-40" aria-label="New chat" title="New chat">
          <SquarePen className="size-4" />
        </button>
        <button type="button" onClick={expand} className="grid size-9 shrink-0 place-items-center rounded-ctl text-body hover:bg-surface hover:text-ink" aria-label="Expand to the full Sage page" title="Expand">
          <Maximize2 className="size-4" />
        </button>
        <button type="button" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-ctl text-body hover:bg-surface hover:text-ink" aria-label="Close Sage">
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-3.5 py-4" aria-live="polite" aria-busy={chat.loading || chat.opening}>
        <div className="flex flex-col gap-4">
          {chat.offline ? (
            <p role="status" className="rounded-xl bg-paper p-3 text-[13px] text-body">Sage is not connected right now. Your earlier chats stay readable.</p>
          ) : null}
          {chat.opening ? (
            <div className="flex flex-col gap-3" aria-label="Opening the chat">
              <div className="h-9 w-2/3 self-end rounded-2xl bg-paper" />
              <div className="h-32 rounded-xl bg-paper" />
            </div>
          ) : chat.turns.length === 0 ? (
            <div className="space-y-3">
              <div>
                <p className="font-display text-[16px] font-semibold text-ink">How can Sage help?</p>
                <p className="mt-1 text-[13.5px] text-body">
                  {role === "admin" ? "Ask about clients, requests, invoices or tax. Sage asks before it changes anything." : "Ask about your assigned requests or tax rules."}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                {STARTERS[role].map((s) => (
                  <button key={s.label} type="button" onClick={() => void chat.send(s.prompt)} className="min-h-10 rounded-xl border border-hairline bg-paper px-3 py-2 text-left text-[13px] text-ink hover:border-line-strong">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.turns.map((t) =>
              t.role === "user" ? (
                <UserBubble key={t.id} text={t.content} at={t.at} compact />
              ) : (
                <SageAnswer
                  key={t.id}
                  turn={t}
                  role={role}
                  compact
                  busy={chat.applying === t.id}
                  onRetry={t.retryText && !chat.loading ? () => chat.retry(t.id, t.retryText!) : undefined}
                  onConfirm={(p) => void chat.confirm(t.id, p)}
                  onDismiss={() => void chat.dismiss(t.id)}
                  onVote={(v, note) => void chat.vote(t.id, v, note)}
                  onRegenerate={t.id === lastAssistantId && !chat.loading ? chat.regenerate : undefined}
                  onReply={() => setDraft({ text: `About your answer: "${t.content.replace(/s+/g, " ").slice(0, 200)}"

`, key: Date.now() })}
                />
              ),
            )
          )}
          {chat.loading ? <Working seconds={chat.waited} onStop={chat.stop} /> : null}
          <div ref={bottom} />
        </div>
      </div>

      <div className="shrink-0 border-t border-hairline bg-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
        <SageComposer
          onSend={chat.send}
          onStop={chat.stop}
          busy={chat.loading}
          disabled={chat.offline}
          disabledReason="Sage is not connected"
          placeholder="Ask Sage…"
          compact
          autoFocus
          draft={draft}
        />
      </div>
    </div>
  );
}
