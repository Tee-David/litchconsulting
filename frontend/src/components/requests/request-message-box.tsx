"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { postRequestMessageAction } from "@/app/dashboard/requests/actions";

/**
 * Client-side reply box on a request. Posts a client-visible "message" event
 * (the advisor sees it and is emailed) — the client half of the request thread;
 * the advisor replies from the admin note box (visible-to-client).
 */
export function RequestMessageBox({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Write a message first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await postRequestMessageAction(requestId, trimmed);
      if (!res.ok) {
        setError(res.error || "Could not send your message.");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-card border border-hairline bg-paper p-5">
      <h3 className="mb-1 font-display text-sm font-bold text-ink">Message your advisor</h3>
      <p className="mb-3 text-xs text-muted">
        Questions, context, or a heads-up about your documents — we&apos;ll reply here and by email.
      </p>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
        }}
        rows={3}
        maxLength={4000}
        placeholder="Write a message…"
        className="w-full resize-y rounded-xl border border-hairline bg-surface p-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand"
      />
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !body.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Send message
        </button>
      </div>
    </div>
  );
}
