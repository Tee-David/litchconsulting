"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUp, Eye, FileSpreadsheet, FileText, ImageIcon, Loader2, Paperclip, Reply, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Attachment = {
  id: string;
  kind: "image" | "file" | "text";
  name: string;
  status: "uploading" | "ready" | "error";
  detail: string;
  /** Object URL of a pasted or dropped image (thumbnail only). */
  url?: string;
  /** Long pasted text (sent as a .txt file). */
  text?: string;
};

/** Text longer than this is sent as a .txt file instead of filling the box. */
export const LONG_TEXT = { chars: 1500, lines: 30 };

/**
 * The Sage message bar, the same everywhere (workbench, widget, Sage page):
 * a quote chip (Reply / Ask about this), attachments (paste or drop screenshots and
 * files; long text becomes a .txt file), the message, then one row of controls with
 * Send or Stop. The box grows with the text up to about a third of the screen, then
 * scrolls inside; focus shows as a darker border and a soft shadow, never an outline.
 */
export function PromptBox({
  value,
  onChange,
  onSubmit,
  running,
  onStop,
  placeholder,
  quote,
  onClearQuote,
  attachments,
  onRemoveAttachment,
  onFiles,
  onLongText,
  accept,
  context,
  extra,
  footnote,
  textareaRef,
  readOnly,
  disabled = false,
  maxLength = 8000,
  variant = "panel",
  autoFocus = false,
  sendLabel = "Send",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  running: boolean;
  onStop: () => void;
  placeholder: string;
  quote?: string | null;
  onClearQuote?: () => void;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  onFiles?: (files: File[]) => void;
  onLongText?: (text: string) => void;
  accept?: string;
  /** Chips after the paperclip (range, whole workbook). */
  context?: ReactNode;
  /** Buttons before Send (voice). */
  extra?: ReactNode;
  footnote?: ReactNode;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  readOnly?: boolean;
  disabled?: boolean;
  maxLength?: number;
  /** "panel": a bar fixed to the bottom of a side panel. "page": a free-standing box. "compact": the widget. */
  variant?: "panel" | "page" | "compact";
  autoFocus?: boolean;
  sendLabel?: string;
}) {
  const [drag, setDrag] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? own;
  const uploading = attachments.some((a) => a.status === "uploading");
  const canSend = !disabled && !running && !uploading && (value.trim().length > 0 || attachments.some((a) => a.status === "ready"));
  const fileInput = `sage-files-${placeholder.length}-${variant}`;
  const compact = variant === "compact";

  // Grow with the text, then scroll inside. Measured on every change, so it also
  // shrinks back after sending.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cap = Math.round(Math.min(window.innerHeight * (compact ? 0.25 : 0.35), compact ? 160 : 280));
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, cap);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  }, [value, compact, ref]);

  const nearLimit = value.length > maxLength * 0.8;

  return (
    <form
      className={cn(
        variant === "panel" && "border-t border-hairline bg-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      onDragOver={(e) => {
        if (!onFiles || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        if (!onFiles || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDrag(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      <div
        className={cn(
          "relative flex flex-col bg-paper transition-[border-color,box-shadow] duration-150",
          compact ? "rounded-2xl" : "rounded-[20px]",
          drag
            ? "border border-dashed border-accent bg-brand-tint"
            : "border border-hairline shadow-[0_1px_2px_rgb(10_14_26/0.04),0_6px_20px_-8px_rgb(10_14_26/0.10)] focus-within:border-line-strong focus-within:shadow-[0_1px_2px_rgb(10_14_26/0.05),0_10px_28px_-10px_rgb(10_25_109/0.22)] dark:shadow-none dark:focus-within:border-muted",
          disabled && "opacity-60",
        )}
      >
        {drag ? (
          <p className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] text-[13px] font-medium text-accent dark:text-info">
            Drop files to add them
          </p>
        ) : null}
        {quote ? (
          <div className="mx-2 mt-2 flex items-start gap-2 rounded-xl bg-brand-tint px-3 py-2 text-[12.5px] text-body">
            <Reply className="mt-0.5 size-3.5 shrink-0 text-accent dark:text-info" aria-hidden />
            <p className="line-clamp-2 min-w-0 flex-1">{quote}</p>
            {onClearQuote ? (
              <button type="button" onClick={onClearQuote} aria-label="Remove the quote" className="-m-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
        {attachments.length ? (
          <div className="flex gap-1.5 overflow-x-auto px-2 pt-2 [scrollbar-width:none]">
            {attachments.map((a) => (
              <span key={a.id} className={cn("inline-flex w-[220px] max-w-[70vw] shrink-0 items-center gap-2 rounded-xl border bg-cloud py-1 pl-1 pr-1.5 text-[12px]", a.status === "error" ? "border-bad/40" : "border-hairline")}>
                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface text-muted">
                  {a.kind === "image" && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt="" className="size-full object-cover" />
                  ) : a.kind === "image" ? (
                    <ImageIcon className="size-4" />
                  ) : a.kind === "text" ? (
                    <FileText className="size-4" />
                  ) : (
                    <FileSpreadsheet className="size-4" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="truncate font-medium text-ink">{a.name}</b>
                  <span className={cn("truncate text-[11px]", a.status === "error" ? "text-bad" : "text-muted")}>
                    {a.status === "uploading" ? <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden /> : null}
                    {a.detail}
                  </span>
                </span>
                {a.kind === "text" && a.text ? (
                  <button type="button" onClick={() => setPeek((p) => (p === a.id ? null : a.id))} aria-label="Preview the pasted text" aria-pressed={peek === a.id} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
                    <Eye className="size-3.5" />
                  </button>
                ) : null}
                <button type="button" onClick={() => onRemoveAttachment(a.id)} aria-label={`Remove ${a.name}`} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {peek ? (
          <pre className="mx-2 mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-hairline bg-cloud p-2.5 font-mono text-[11.5px] text-body">
            {attachments.find((a) => a.id === peek)?.text}
          </pre>
        ) : null}
        <textarea
          ref={ref}
          value={value}
          readOnly={readOnly}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={maxLength}
          rows={1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          onPaste={(e) => {
            const files = [...(e.clipboardData?.files ?? [])];
            if (files.length && onFiles) {
              e.preventDefault();
              onFiles(files);
              return;
            }
            const text = e.clipboardData?.getData("text") ?? "";
            if (onLongText && (text.length > LONG_TEXT.chars || text.split("\n").length > LONG_TEXT.lines)) {
              e.preventDefault();
              onLongText(text);
            }
          }}
          placeholder={placeholder}
          aria-label="Message to Sage"
          className={cn(
            "block w-full resize-none overflow-hidden bg-transparent text-ink outline-none [overflow-wrap:anywhere] [scrollbar-width:thin] placeholder:text-faint disabled:cursor-not-allowed",
            compact ? "min-h-[44px] px-3.5 pb-1 pt-3 text-[14px] leading-[22px]" : "min-h-[52px] px-4 pb-1 pt-3.5 text-[15px] leading-6",
          )}
        />
        <div className={cn("flex items-center gap-1", compact ? "px-1.5 pb-1.5" : "px-2 pb-2")}>
          {onFiles ? (
            <>
              <label
                htmlFor={fileInput}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-body transition-colors hover:bg-surface hover:text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
                title="Add files or a screenshot (or paste, or drop)"
              >
                <Paperclip className="size-[18px]" aria-hidden />
                <span className="sr-only">Add files or a screenshot</span>
              </label>
              <input
                id={fileInput}
                type="file"
                multiple
                accept={accept}
                className="sr-only"
                onChange={(e) => {
                  const fs = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (fs.length) onFiles(fs);
                }}
              />
            </>
          ) : null}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">{context}</div>
          <span className="ml-auto" />
          {nearLimit ? (
            <span className={cn("shrink-0 px-1 text-[11.5px] tabular-nums", value.length >= maxLength ? "text-bad" : "text-muted")} aria-live="polite">
              {value.length.toLocaleString("en-NG")} / {maxLength.toLocaleString("en-NG")}
            </span>
          ) : focused && value.trim() && !compact ? (
            <span className="hidden shrink-0 px-1 text-[11.5px] text-faint sm:inline">Enter to send · Shift+Enter for a new line</span>
          ) : null}
          {extra}
          {running ? (
            <button type="button" onClick={onStop} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-paper transition-transform hover:scale-105" aria-label="Stop" title="Stop">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
                canSend ? "bg-act text-act-ink hover:bg-act-hover" : "cursor-not-allowed bg-surface text-faint",
              )}
              aria-label={uploading ? "Wait for the files to finish" : sendLabel}
              title={uploading ? "Wait for the files to finish" : sendLabel}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      {footnote ? <p className="mx-2 mt-1.5 text-center text-[11px] leading-snug text-faint">{footnote}</p> : null}
    </form>
  );
}
