"use client";

import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationTick } from "./citation-tick";

/**
 * Sage's answer text. Markdown (lists, bold, tables) styled with tokens. If
 * the text carries [n] markers for known sources, each becomes an audit tick
 * linked to the margin.
 */
export function SageMarkdown({ content, answerId, sourceCount = 0, compact = false }: { content: string; answerId: string; sourceCount?: number; compact?: boolean }) {
  const text = useMemo(
    () => (sourceCount ? content.replace(/\[(\d{1,2})\](?!\()/g, (m, d) => (Number(d) >= 1 && Number(d) <= sourceCount ? `[${d}](#tick-${d})` : m)) : content),
    [content, sourceCount],
  );
  return (
    <div className={compact ? "text-sm leading-relaxed text-ink" : "text-[15px] leading-[1.65] text-ink"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (p) => <p className="mb-2.5 last:mb-0" {...p} />,
          ul: (p) => <ul className="mb-2.5 ml-5 list-disc space-y-1 last:mb-0" {...p} />,
          ol: (p) => <ol className="mb-2.5 ml-5 list-decimal space-y-1 last:mb-0" {...p} />,
          li: (p) => <li className="pl-0.5" {...p} />,
          strong: (p) => <strong className="font-semibold text-ink" {...p} />,
          a: ({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) => {
            const tick = href?.match(/^#tick-(\d+)$/);
            if (tick) return <CitationTick n={Number(tick[1])} answerId={answerId} />;
            return (
              <a href={href} className="font-medium text-accent underline underline-offset-2 dark:text-info" target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          },
          h1: (p) => <h3 className="mb-1.5 mt-3 font-display text-base font-semibold text-ink first:mt-0" {...p} />,
          h2: (p) => <h3 className="mb-1.5 mt-3 font-display text-base font-semibold text-ink first:mt-0" {...p} />,
          h3: (p) => <h4 className="mb-1 mt-2.5 font-semibold text-ink first:mt-0" {...p} />,
          code: ({ className, ...rest }: ComponentPropsWithoutRef<"code">) =>
            /language-/.test(className || "") ? (
              <code className="font-mono text-[13px]" {...rest} />
            ) : (
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-ink" {...rest} />
            ),
          pre: (p) => <pre className="mb-2.5 overflow-x-auto rounded-ctl border border-hairline bg-surface p-3 text-[13px] last:mb-0" {...p} />,
          blockquote: (p) => <blockquote className="border-l border-line-strong pl-3 text-body" {...p} />,
          table: (p) => (
            <div className="mb-2.5 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-[13px] tabular-nums" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-hairline px-2 py-1.5 text-left text-xs font-medium text-muted" {...p} />,
          td: (p) => <td className="border-b border-hairline px-2 py-1.5" {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Reveals a fresh answer word by word (about a second for any length). Reduced motion shows it at once. */
export function RevealMarkdown(props: { content: string; answerId: string; sourceCount?: number; compact?: boolean }) {
  const parts = useMemo(() => props.content.split(/(\s+)/), [props.content]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(parts.length);
      return;
    }
    const step = Math.max(1, Math.ceil(parts.length / 50));
    const t = setInterval(() => {
      setShown((n) => {
        const next = Math.min(parts.length, n + step);
        if (next >= parts.length) clearInterval(t);
        return next;
      });
    }, 20);
    return () => clearInterval(t);
  }, [parts]);
  return <SageMarkdown {...props} content={shown >= parts.length ? props.content : parts.slice(0, shown).join("")} />;
}
