"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { MessageSquareQuote } from "lucide-react";

/**
 * Highlight words in a Sage answer → a small "Ask Sage about this" button above the
 * highlight. Clicking it hands the words to the composer as a quote.
 */
export function AskSelection({ root, onAsk }: { root: RefObject<HTMLElement | null>; onAsk: (text: string) => void }) {
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const up = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const node = sel?.anchorNode ? (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode.parentElement) : null;
      if (!sel || text.length < 3 || !node?.closest("[data-sage-answer]") || !el.contains(node)) {
        setAt(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      setAt({ x: r.left + r.width / 2, y: r.top, text: text.slice(0, 400) });
    };
    const clear = () => setAt(null);
    el.addEventListener("mouseup", up);
    el.addEventListener("keyup", up);
    el.addEventListener("scroll", clear, { passive: true });
    return () => {
      el.removeEventListener("mouseup", up);
      el.removeEventListener("keyup", up);
      el.removeEventListener("scroll", clear);
    };
  }, [root]);

  if (!at) return null;
  return createPortal(
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onAsk(at.text);
        setAt(null);
        window.getSelection()?.removeAllRanges();
      }}
      className="fixed z-[90] inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-ctl bg-act px-3 text-[12.5px] font-medium text-act-ink shadow-lg hover:bg-act-hover"
      style={{ left: Math.max(90, Math.min(at.x, window.innerWidth - 90)), top: Math.max(8, at.y - 44) }}
    >
      <MessageSquareQuote className="size-4" aria-hidden /> Ask Sage about this
    </button>,
    document.body,
  );
}
