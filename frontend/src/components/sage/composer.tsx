"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoice } from "@/components/workbench/voice";
import { PromptBox } from "@/components/sage-ui/prompt-box";
import { Suggestions } from "@/components/sage-ui/suggestions";
import { cn } from "@/lib/utils";

const MAX = 3000;

/**
 * Sage composer for the Sage page and the widget: suggested questions, then the shared
 * message bar (the same as the workbench) with push-to-talk where the browser has it.
 * Enter sends; Shift+Enter makes a new line. Sage chat takes no files (the workbench does).
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
  footnote,
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
  footnote?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice(useCallback((t: string) => setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t)), []));

  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [draft]);

  const submit = async (value = text) => {
    const v = value.trim();
    if (!v || busy || disabled) return;
    setText("");
    const ok = await onSend(v);
    if (ok === false) setText((cur) => cur || v);
  };

  const shown = voice.listening && voice.transcript ? `${text.trim() ? `${text.trimEnd()} ` : ""}${voice.transcript}` : text;

  const mic =
    voice.supported && !disabled ? (
      <button
        type="button"
        {...voice.handlers}
        aria-pressed={voice.listening}
        aria-label={voice.listening ? "Listening, release to stop" : "Hold to talk"}
        title="Hold to talk"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
          voice.listening ? "bg-bad-soft text-bad" : "text-body hover:bg-surface hover:text-ink",
        )}
      >
        <voice.Icon className="size-[18px]" strokeWidth={1.75} />
      </button>
    ) : null;

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-2.5")}>
      {chips.length && !disabled ? <Suggestions items={chips} disabled={busy} onPick={(c) => void submit(c)} /> : null}
      {voice.error ? <p className="text-xs text-bad">{voice.error}</p> : null}
      <PromptBox
        variant={compact ? "compact" : "page"}
        value={shown}
        onChange={setText}
        onSubmit={() => void submit()}
        running={busy && Boolean(onStop)}
        onStop={() => onStop?.()}
        placeholder={disabled ? disabledReason ?? placeholder : placeholder}
        attachments={[]}
        onRemoveAttachment={() => undefined}
        textareaRef={ref}
        readOnly={voice.listening}
        disabled={disabled}
        maxLength={MAX}
        autoFocus={autoFocus}
        extra={mic}
        footnote={footnote}
      />
    </div>
  );
}
