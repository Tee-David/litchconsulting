"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, User, UserCheck } from "lucide-react";
import { replyClientTicketAction } from "../actions";

type Message = {
  id: string;
  ticketId: string;
  authorName: string | null;
  authorRole: string; // "client" | "agent"
  body: string;
  createdAt: Date | string;
};

type SupportThreadClientProps = {
  ticketId: string;
  messages: Message[];
  ticketStatus: string;
};

export function SupportThreadClient({ ticketId, messages, ticketStatus }: SupportThreadClientProps) {
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on load or new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!replyText.trim()) return;

    startTransition(async () => {
      const res = await replyClientTicketAction(ticketId, replyText.trim());

      if (res.ok) {
        setReplyText("");
        router.refresh();
      } else {
        setError(res.error || "Failed to send message.");
      }
    });
  };

  return (
    <div className="flex flex-col h-[600px] border border-hairline rounded-card bg-paper overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-surface/30">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <p>No messages in this ticket yet.</p>
          </div>
        ) : (
          messages.map((m) => {
            const isAdminSender = m.authorRole === "agent";
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-[85%] ${
                  isAdminSender ? "mr-auto" : "ml-auto flex-row-reverse"
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`size-8 rounded-full flex items-center justify-center shrink-0 text-white ${
                    isAdminSender ? "bg-brand" : "bg-neutral-500"
                  }`}
                >
                  {isAdminSender ? (
                    <UserCheck className="size-4.5" />
                  ) : (
                    <User className="size-4.5" />
                  )}
                </div>

                {/* Message Bubble */}
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-ink">
                      {m.authorName || "Anonymous"}
                    </span>
                    <span className="text-[10px] text-muted font-medium">
                      {isAdminSender ? "Advisor" : "Client"}
                    </span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      isAdminSender
                        ? "bg-paper border border-hairline text-ink rounded-tl-none"
                        : "bg-brand text-white rounded-tr-none"
                    }`}
                  >
                    {m.body}
                  </div>

                  <p className={`text-[10px] text-muted ${!isAdminSender && "text-right"}`}>
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer Area */}
      <div className="border-t border-hairline p-4 space-y-3 bg-paper">
        {ticketStatus === "closed" && (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-xl text-center">
            Note: This ticket is currently closed. Sending a reply will automatically re-open it.
          </p>
        )}

        {error && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 p-2 rounded-xl text-center">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            rows={1}
            placeholder="Type a message or response..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isPending}
            className="flex-1 rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none resize-none max-h-24 min-h-[42px]"
          />
          <button
            type="submit"
            disabled={isPending || !replyText.trim()}
            className="inline-flex size-[42px] items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-50 shrink-0"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
