"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import type { EngagementAskResponse } from "@/lib/litchai/client";
import { askAssistant, engagementAction } from "@/app/admin/analyses/actions";

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; response: EngagementAskResponse };

const TEMPLATE_PROMPTS = [
  "Walk me through net profit",
  "Why is this line in that category?",
  "Which figures need my review?",
  "Explain the bank reconciliation gap",
];

/**
 * Engagement sign-off + the conversational review assistant as a proper
 * thread (Omni inspo): multi-turn history, template prompts, grounded refs on
 * every answer, and proposed corrections surfaced — never auto-applied. The
 * assistant explains from the deterministic ReviewPack; it cannot invent
 * numbers or touch formulas (PRD §11b).
 */
export function EngagementPanel({
  engagementId,
  documentId,
}: {
  engagementId: number;
  documentId: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, asking]);

  function act(action: "approve" | "reject" | "reopen") {
    startTransition(async () => {
      const res = await engagementAction(engagementId, action, documentId);
      if (res.ok) {
        toast.success(`Engagement ${res.status}.`);
        router.refresh();
      } else {
        toast.error(res.error || "Action failed.");
      }
    });
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking) return;
    setQuestion("");
    setThread((t) => [...t, { role: "user", text: q }]);
    setAsking(true);
    const res = await askAssistant(engagementId, q);
    setAsking(false);
    if (res.ok && res.response) {
      setThread((t) => [...t, { role: "assistant", response: res.response! }]);
    } else {
      toast.error(res.error || "Assistant unavailable.");
      setThread((t) => t.slice(0, -1)); // let them retry the same question
      setQuestion(q);
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-hairline bg-surface/50 p-4">
      {/* Sign-off */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("approve")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CheckCircle2 className="size-4" /> Approve (deliverable)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("reject")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-body hover:bg-cloud disabled:opacity-50"
        >
          <XCircle className="size-4" /> Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("reopen")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-body hover:bg-cloud disabled:opacity-50"
        >
          <RotateCcw className="size-4" /> Reopen
        </button>
      </div>

      {/* Assistant thread */}
      <div className="rounded-xl border border-hairline bg-paper">
        {thread.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-brand-tint text-brand">
              <Bot className="size-5" />
            </span>
            <p className="mt-2 text-sm font-semibold text-ink">Ask the workbook anything</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-body">
              Answers trace to real cells — the assistant explains, it never invents numbers. Edit
              requests come back as proposals you apply from the grid.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {TEMPLATE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void ask(p)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-body transition-colors hover:border-brand/40 hover:bg-surface"
                >
                  <Sparkles className="size-3 text-brand" /> {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="max-h-80 space-y-3 overflow-y-auto p-4">
            {thread.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-white keep-brand">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                    <Bot className="size-3.5" />
                  </span>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-hairline bg-surface px-3.5 py-2 text-sm">
                    <p className="text-ink">{m.response.answer || "(no answer)"}</p>
                    {m.response.grounded_refs.length > 0 && (
                      <p className="mt-1.5 text-xs text-muted">
                        Traces to: {m.response.grounded_refs.join(", ")}
                      </p>
                    )}
                    {m.response.proposed_correction && (
                      <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Proposed {m.response.proposed_correction.kind}:{" "}
                        {m.response.proposed_correction.target} →{" "}
                        {m.response.proposed_correction.new_value} — apply it from the grid to keep
                        the math verified.
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
            {asking && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" /> Reading the workbook…
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="flex items-center gap-2 border-t border-hairline p-3"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder='Ask about this workbook — "how did you get net profit?"'
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 keep-brand"
            )}
          >
            {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
