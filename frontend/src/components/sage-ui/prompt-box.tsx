"use client";

import { useState, type ReactNode, type RefObject } from "react";
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
 * The Sage composer: quote chip (Reply / Ask about this), attachments (paste or drop
 * screenshots and files; long text becomes a .txt file), the message, then one row
 * of controls with Send or Stop. Shared by the workbench, the widget and the page.
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
}) {
  const [drag, setDrag] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const uploading = attachments.some((a) => a.status === "uploading");
  const canSend = !running && !uploading && (value.trim().length > 0 || attachments.some((a) => a.status === "ready"));
  const fileInput = `sage-files-${placeholder.length}`;

  return (
    <form
      className="border-t border-hairline bg-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5"
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
          "flex flex-col gap-1.5 rounded-2xl border bg-paper p-1.5 transition-colors focus-within:border-accent focus-within:ring-[3px] focus-within:ring-diff-sel",
          drag ? "border-dashed border-accent bg-brand-tint" : "border-line-strong",
        )}
      >
        {quote ? (
          <div className="flex items-start gap-2 rounded-ctl bg-brand-tint px-2.5 py-1.5 text-[12.5px] text-body">
            <Reply className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            <p className="line-clamp-2 min-w-0 flex-1">{quote}</p>
            {onClearQuote ? (
              <button type="button" onClick={onClearQuote} aria-label="Remove the quote" className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-paper">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
        {attachments.length ? (
          <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
            {attachments.map((a) => (
              <span key={a.id} className={cn("inline-flex max-w-[240px] items-center gap-2 rounded-ctl border bg-cloud py-1 pl-1 pr-1.5 text-[12px]", a.status === "error" ? "border-bad/40" : "border-hairline")}>
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-surface text-muted">
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
                <span className="flex min-w-0 flex-col leading-tight">
                  <b className="truncate font-medium text-ink">{a.name}</b>
                  <span className={cn("truncate text-[11px]", a.status === "error" ? "text-bad" : "text-muted")}>
                    {a.status === "uploading" ? <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden /> : null}
                    {a.detail}
                  </span>
                </span>
                {a.kind === "text" && a.text ? (
                  <button type="button" onClick={() => setPeek((p) => (p === a.id ? null : a.id))} aria-label="Preview the pasted text" aria-pressed={peek === a.id} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink">
                    <Eye className="size-3.5" />
                  </button>
                ) : null}
                <button type="button" onClick={() => onRemoveAttachment(a.id)} aria-label={`Remove ${a.name}`} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {peek ? (
          <pre className="mx-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-ctl border border-hairline bg-cloud p-2.5 font-mono text-[11.5px] text-body">
            {attachments.find((a) => a.id === peek)?.text}
          </pre>
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={readOnly}
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
          rows={Math.min(6, Math.max(1, value.split("\n").length))}
          placeholder={placeholder}
          aria-label="Message to Sage"
          className="max-h-40 min-h-10 resize-none bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-1">
          {onFiles ? (
            <>
              <label htmlFor={fileInput} className="grid size-9 cursor-pointer place-items-center rounded-ctl text-body hover:bg-surface hover:text-ink" title="Add files or a screenshot (or paste, or drop)">
                <Paperclip className="size-4" aria-hidden />
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
          {context}
          <span className="ml-auto" />
          {extra}
          {running ? (
            <button type="button" onClick={onStop} className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-paper" aria-label="Stop">
              <Square className="size-3.5" />
            </button>
          ) : (
            <button type="submit" disabled={!canSend} className="grid size-9 shrink-0 place-items-center rounded-xl bg-act text-act-ink hover:bg-act-hover disabled:cursor-not-allowed disabled:opacity-35" aria-label={uploading ? "Wait for the files to finish" : "Send"}>
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
      {footnote ? <p className="mx-1 mt-1.5 text-[11px] text-faint">{footnote}</p> : null}
    </form>
  );
}
