"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, Send, XCircle } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import type { AssistantResponse } from "@/lib/litchai/client";
import { askAssistant, engagementAction } from "@/app/admin/litchai/actions";

/**
 * Engagement sign-off + conversational review assistant. Approve marks the
 * compiled workbook a deliverable and locks corrections; the chat explains the
 * workbook from the deterministic ReviewPack (never invents numbers) and turns
 * edit requests into *proposed* corrections you then apply.
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
  const [answer, setAnswer] = useState<AssistantResponse | null>(null);

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

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    const res = await askAssistant(engagementId, question);
    setAsking(false);
    if (res.ok && res.response) setAnswer(res.response);
    else toast.error(res.error || "Assistant unavailable.");
  }

  return (
    <div className="space-y-4 rounded-card border border-hairline bg-surface/50 p-4">
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

      <form onSubmit={ask} className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this workbook — “how did you get net profit?”"
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={asking}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Ask
        </button>
      </form>

      {answer && (
        <div className="rounded-lg border border-hairline bg-paper p-3 text-sm">
          <p className="text-ink">{answer.answer}</p>
          {answer.grounded_refs.length > 0 && (
            <p className="mt-1 text-xs text-muted">Traces to: {answer.grounded_refs.join(", ")}</p>
          )}
          {answer.proposed_correction && (
            <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              Proposed {answer.proposed_correction.kind}: {answer.proposed_correction.target} →{" "}
              {answer.proposed_correction.new_value} (apply it from the grid to keep the math verified)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
