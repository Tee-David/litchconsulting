import { BookOpen, Database, EyeOff, ListChecks, ListTree, PenLine, Route } from "lucide-react";
import { Trace } from "@/components/sage-ui/trace";
import type { ProvenanceFact } from "@/lib/sage/present";
import { cn } from "@/lib/utils";

const ICON = { books: Database, knowledge: BookOpen, route: Route, model: PenLine, rules: ListChecks, masked: EyeOff } as const;
const TONE = { books: "text-good", knowledge: "text-info", route: "text-info", model: "text-body", rules: "text-body", masked: "text-body" } as const;

/**
 * "How this answer was made", folded into one line (shadcn.io/ai "Chain of
 * Thought"): the first fact is the title; the line opens to every fact.
 */
export function ProvenanceLine({ facts, className }: { facts: ProvenanceFact[]; className?: string }) {
  if (!facts.length) return null;
  const lead = facts.find((f) => f.kind === "books" || f.kind === "knowledge") ?? facts[0];
  return (
    <div data-tour="sage-provenance" className={className}>
      <Trace size="sm" icon={<ListTree />} title={`How this answer was made · ${lead.text}`}>
        <ul className="space-y-1 pt-1">
          {facts.map((f) => {
            const Icon = ICON[f.kind];
            return (
              <li key={f.kind + f.text} className="flex items-start gap-2 text-[12.5px] text-body">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", TONE[f.kind])} strokeWidth={1.5} aria-hidden />
                {f.text}
              </li>
            );
          })}
        </ul>
      </Trace>
    </div>
  );
}
