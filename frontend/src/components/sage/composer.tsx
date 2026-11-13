"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useVoice } from "@/components/workbench/voice";
import { cn } from "@/lib/utils";

const MAX = 3000;

/**
 * Sage composer: follow-up chips, the text box, push-to-talk (only where the
 * browser supports speech), and Send (Stop while an answer is in flight).
 * Enter sends; Shift+Enter makes a new line. There is no attach button:
 * Sage chat does not take files (the workbench does).
 */
export function SageComposer({
  onSend,
  onStop,
  busy,
  disabled,
  disabledReason,
  chips = [],
  placeholder,
  compact = false,
  autoFocus = false,
  draft,
}: {
  onSend: (text: string) => Promise<boolean> | boolean | void;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  disabledReason?: string;
  chips?: string[];
  placeholder: string;
  compact?: boolean;
  autoFocus?: boolean;
  /** Set to fill the box (a starter prompt); the person sends it. */
  draft?: { text: string; key: number } | null;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice(useCallback((t: string) => setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t)), []));

  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    requestAnimationFrame(() => ref.current?.focus());
  }, [draft]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 168)}px`;
  }, [text, compact]);

  const submit = async (value = text) => {
    const v = value.trim();
    if (!v || busy || disabled) return;
    setText("");
    const ok = await onSend(v);
    if (ok === false) setText((cur) => cur || v);
  };

  const shown = voice.listening && voice.transcript ? `${text.trim() ? `${text.trimEnd()} ` : ""}${voice.transcript}` : text;

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-2")}>
      {chips.length && !disabled ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Suggested questions">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => void submit(c)}
              className="h-8 shrink-0 rounded-full border border-line-strong bg-paper px-3 text-[12.5px] text-ink outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
      {voice.error ? <p className="text-xs text-bad">{voice.error}</p> : null}
      <div
        className={cn(
          "flex items-end gap-2 border border-line-strong bg-paper transition-colors focus-within:border-accent",
          compact ? "rounded-xl p-1.5 pl-3" : "rounded-2xl p-2.5 pl-4 shadow-[0_1px_2px_rgb(10_14_26/0.05)] dark:shadow-none",
          disabled && "opacity-60",
        )}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Ask Sage</span>
          <textarea
            ref={ref}
            value={shown}
            readOnly={voice.listening}
            disabled={disabled}
            autoFocus={autoFocus}
            maxLength={MAX}
            rows={compact ? 1 : 2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={disabled ? disabledReason ?? placeholder : placeholder}
            className={cn("block w-full resize-none bg-transparent py-1.5 text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed", compact ? "text-sm" : "text-[14.5px]")}
          />
        </label>
        {voice.supported && !disabled ? (
          <button
            type="button"
            {...voice.handlers}
            aria-pressed={voice.listening}
            aria-label={voice.listening ? "Listening, release to stop" : "Hold to talk"}
            title="Hold to talk"
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-ctl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
              voice.listening ? "border-bad bg-bad-soft text-bad" : "border-hairline bg-paper text-body hover:bg-surface",
            )}
          >
            <voice.Icon className="size-[18px]" strokeWidth={1.5} />
          </button>
        ) : null}
        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop the answer"
            title="Stop"
            className="grid size-10 shrink-0 place-items-center rounded-ctl border border-line-strong bg-paper text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || disabled || busy}
            aria-label="Send"
            className="grid size-10 shrink-0 place-items-center rounded-ctl bg-act text-act-ink outline-none transition-colors hover:bg-act-hover focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-[18px]" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
