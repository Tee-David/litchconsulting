"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { ConfirmSheet } from "@/components/kit";
import { railGroup, shortWhen } from "@/lib/sage/present";
import { cn } from "@/lib/utils";
import type { SageChat } from "./use-sage-chat";

/**
 * Chat history: New chat, Search chats, then threads grouped "Waiting for
 * you" (a proposal waits for a confirm), "This week", and by month. Rename
 * and delete sit on each row (visible on touch, on hover or focus with a mouse).
 */
export function HistoryRail({ chat, online, onPicked, heading = true }: { chat: SageChat; online: boolean; onPicked?: () => void; heading?: boolean }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);

  const list = chat.conversations;
  const groups = useMemo(() => {
    const out: { name: string; items: typeof list }[] = [];
    for (const c of list) {
      const name = railGroup(c.updatedAt, c.pending > 0);
      const g = out.find((x) => x.name === name);
      if (g) g.items.push(c);
      else out.push({ name, items: [c] });
    }
    return out.sort((a, b) => (a.name === "Waiting for you" ? -1 : b.name === "Waiting for you" ? 1 : 0));
  }, [list]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5 px-3.5 py-5">
      {heading ? (
        <div className="flex items-center justify-between px-1">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-ink">Sage</h1>
          <span className={cn("inline-flex items-center gap-1.5 text-xs", online ? "text-good" : "text-muted")}>
            <span aria-hidden className={cn("size-[7px] rounded-full", online ? "bg-good" : "bg-faint")} />
            {online ? "Online" : "Not connected"}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          chat.newChat();
          onPicked?.();
        }}
        className="flex h-10 items-center justify-center gap-2 rounded-ctl bg-act text-sm font-semibold text-act-ink outline-none transition-colors hover:bg-act-hover focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden /> New chat
      </button>
      <label className="relative block">
        <span className="sr-only">Search chats</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden />
        <input
          type="search"
          value={chat.query}
          onChange={(e) => chat.setQuery(e.target.value)}
          placeholder="Search chats"
          className="h-9 w-full rounded-ctl border border-line-strong bg-paper pl-8 pr-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
        />
      </label>

      <nav aria-label="Chats" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {chat.historyLoading ? (
          <div className="flex flex-col gap-2 pt-1" aria-label="Loading chats">
            {[70, 90, 60, 80].map((w) => (
              <div key={w} className="rounded-ctl p-2.5">
                <div className="h-3.5 rounded bg-surface" style={{ width: `${w}%` }} />
                <div className="mt-1.5 h-3 w-1/3 rounded bg-surface" />
              </div>
            ))}
          </div>
        ) : chat.historyError ? (
          <div className="px-1.5 pt-2 text-[13px] text-body">
            <p>Your chats did not load.</p>
            <button type="button" onClick={() => void chat.refreshHistory()} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-ctl border border-line-strong bg-paper px-3 text-[13px] text-ink hover:bg-surface">
              <RefreshCw className="size-3.5" aria-hidden /> Retry
            </button>
          </div>
        ) : chat.conversations.length === 0 ? (
          <p className="px-1.5 pt-2 text-[13px] text-muted">
            {chat.query ? `No chats match "${chat.query}". Try another word.` : "No chats yet. Your questions to Sage are kept here, for you only."}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.name} className="flex flex-col gap-0.5">
              <p className="px-1.5 pb-1 pt-3 text-xs text-muted first:pt-1.5">{g.name}</p>
              {g.items.map((c) => {
                const active = c.id === chat.conversationId;
                if (renaming === c.id) {
                  return (
                    <form
                      key={c.id}
                      className="flex items-center gap-1 p-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void chat.rename(c.id, draft);
                        setRenaming(null);
                      }}
                    >
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">Chat name</span>
                        <input
                          autoFocus
                          value={draft}
                          maxLength={120}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                          className="h-9 w-full rounded-ctl border border-accent bg-paper px-2 text-[13px] text-ink outline-none"
                        />
                      </label>
                      <button type="submit" aria-label="Save the name" className="grid size-9 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink">
                        <Check className="size-4" />
                      </button>
                      <button type="button" aria-label="Cancel" onClick={() => setRenaming(null)} className="grid size-9 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink">
                        <X className="size-4" />
                      </button>
                    </form>
                  );
                }
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative flex items-start rounded-ctl transition-colors",
                      active ? "bg-paper shadow-[0_1px_2px_rgb(10_14_26/0.06)] dark:shadow-none dark:ring-1 dark:ring-hairline" : "hover:bg-paper/60",
                    )}
                  >
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        void chat.select(c.id);
                        onPicked?.();
                      }}
                      className="flex min-w-0 flex-1 gap-2.5 rounded-ctl p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <span
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", c.pending ? "bg-warn" : "bg-transparent")}
                        aria-label={c.pending ? "Needs your confirmation" : undefined}
                        role={c.pending ? "img" : undefined}
                      />
                      <span className="min-w-0">
                        <span className={cn("block truncate text-[13.5px] text-ink", (active || c.pending) && "font-semibold")}>{c.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {c.pending ? `${c.pending} ${c.pending === 1 ? "action" : "actions"} to confirm` : "Answered"} · {shortWhen(c.updatedAt)}
                        </span>
                      </span>
                    </button>
                    <span className={cn("flex shrink-0 items-center pr-1 pt-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100", active && "opacity-100")}>
                      <button
                        type="button"
                        aria-label={`Rename ${c.title}`}
                        onClick={() => {
                          setDraft(c.title);
                          setRenaming(c.id);
                        }}
                        className="grid size-8 place-items-center rounded-ctl text-muted outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <Pencil className="size-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${c.title}`}
                        onClick={() => setDeleting({ id: c.id, title: c.title })}
                        className="grid size-8 place-items-center rounded-ctl text-muted outline-none hover:bg-bad-soft hover:text-bad focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.5} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </nav>

      <ConfirmSheet
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting ? chat.remove(deleting.id) : undefined)}
        title="Delete this chat"
        body={<>The chat &quot;{deleting?.title}&quot; and its answers are deleted for good. Confirmed actions stay in the audit log.</>}
        confirmLabel="Delete chat"
        tone="danger"
      />
    </div>
  );
}
