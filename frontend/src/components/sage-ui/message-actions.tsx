"use client";

import { useState } from "react";
import { Copy, RefreshCw, Reply, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type Vote = "good" | "bad" | null;
const REASONS = ["Wrong numbers", "Wrong cells", "Did not do what I asked", "Too slow", "Other"];

/**
 * The row under every Sage answer: Copy, Regenerate (last answer only), Good, Bad
 * (with a short note), Reply. Same parts in the workbench, the widget and the Sage page.
 */
export function MessageActions({
  text,
  vote,
  onVote,
  onRegenerate,
  onReply,
  onCopied,
}: {
  text: string;
  vote: Vote;
  onVote: (vote: Vote, note?: string) => void | Promise<void>;
  onRegenerate?: () => void;
  onReply?: () => void;
  onCopied?: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const btn = "grid size-8 place-items-center rounded-ctl text-muted hover:bg-paper hover:text-ink aria-pressed:bg-brand-tint aria-pressed:text-accent";

  return (
    <div className="space-y-2">
      <div className="-ml-1.5 flex items-center gap-0.5">
        <button
          type="button"
          className={btn}
          aria-label="Copy answer"
          title="Copy"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(onCopied, () => undefined);
          }}
        >
          <Copy className="size-4" />
        </button>
        {onRegenerate ? (
          <button type="button" className={btn} aria-label="Regenerate" title="Regenerate (the earlier answer is kept)" onClick={onRegenerate}>
            <RefreshCw className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          className={btn}
          aria-label="Good answer"
          title="Good answer"
          aria-pressed={vote === "good"}
          onClick={() => {
            setNoteOpen(false);
            void onVote(vote === "good" ? null : "good");
          }}
        >
          <ThumbsUp className="size-4" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Bad answer"
          title="Bad answer"
          aria-pressed={vote === "bad"}
          onClick={() => {
            if (vote === "bad") {
              setNoteOpen(false);
              void onVote(null);
            } else setNoteOpen(true);
          }}
        >
          <ThumbsDown className="size-4" />
        </button>
        {onReply ? (
          <button type="button" className={btn} aria-label="Reply to this answer" title="Reply" onClick={onReply}>
            <Reply className="size-4" />
          </button>
        ) : null}
      </div>
      {noteOpen ? (
        <div className="space-y-2 rounded-xl border border-hairline bg-paper p-2.5">
          <p className="text-[13px] font-semibold text-ink">What went wrong?</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
                className={cn("min-h-8 rounded-full border px-2.5 text-[12px]", reason === r ? "border-accent bg-brand-tint text-accent" : "border-hairline text-body hover:border-line-strong")}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Optional: what should Sage have done?"
            aria-label="Note for the Sage team"
            className="w-full resize-y rounded-ctl border border-hairline bg-cloud px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => { setNoteOpen(false); void onVote("bad"); }} className="min-h-8 rounded-ctl px-3 text-[12.5px] text-body hover:bg-surface">
              Skip
            </button>
            <button
              type="button"
              onClick={() => {
                setNoteOpen(false);
                void onVote("bad", [reason, note.trim()].filter(Boolean).join(": "));
              }}
              className="min-h-8 rounded-ctl bg-act px-3 text-[12.5px] font-medium text-act-ink hover:bg-act-hover"
            >
              Send note
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
