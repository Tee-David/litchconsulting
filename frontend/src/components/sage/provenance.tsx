import { BookOpen, Database, EyeOff, ListChecks, PenLine, Route } from "lucide-react";
import type { ProvenanceFact } from "@/lib/sage/present";
import { cn } from "@/lib/utils";

const ICON = { books: Database, knowledge: BookOpen, route: Route, model: PenLine, rules: ListChecks, masked: EyeOff } as const;
const TONE = { books: "text-good", knowledge: "text-info", route: "text-info", model: "text-body", rules: "text-body", masked: "text-body" } as const;

/** "How this answer was made": where the facts came from and who wrote the words. */
export function ProvenanceLine({ facts, className }: { facts: ProvenanceFact[]; className?: string }) {
  if (!facts.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted", className)}>
      <span>How this answer was made</span>
      {facts.map((f) => {
        const Icon = ICON[f.kind];
        return (
          <span key={f.kind + f.text} className="inline-flex items-center gap-1.5">
            <Icon className={cn("size-3.5", TONE[f.kind])} strokeWidth={1.5} aria-hidden />
            {f.text}
          </span>
        );
      })}
    </div>
  );
}
