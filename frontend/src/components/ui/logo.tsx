import { cn } from "@/lib/utils";

/** Temporary "Litch" wordmark — an interlocking L mark + wordmark. */
export function Logo({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const text = tone === "light" ? "text-white" : "text-ink";
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-display", className)}>
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M6 4v13a2 2 0 0 0 2 2h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 5l5 3v6" stroke="#4c6ef5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={cn("text-lg font-bold tracking-tight", text)}>
        Litch<span className="text-brand">.</span>
      </span>
    </span>
  );
}
