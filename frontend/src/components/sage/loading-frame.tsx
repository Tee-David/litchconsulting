/** Sage page skeleton: the final layout with flat bars (no shimmer). */
export function SageLoadingFrame({ frameClassName }: { frameClassName: string }) {
  return (
    <div className={`flex min-h-0 overflow-hidden bg-desk ${frameClassName}`} aria-busy="true" aria-label="Loading Sage">
      <div className="hidden w-[268px] shrink-0 flex-col gap-3.5 border-r border-hairline bg-surface px-3.5 py-5 lg:flex">
        <div className="h-7 w-24 rounded bg-paper" />
        <div className="h-10 rounded-ctl bg-paper" />
        <div className="h-9 rounded-ctl bg-paper" />
        {[80, 60, 70].map((w) => (
          <div key={w} className="h-10 rounded-ctl bg-paper/70" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-16 shrink-0 border-b border-hairline bg-paper" />
        <div className="mx-auto w-full max-w-[900px] flex-1 px-4 pt-6 sm:px-8">
          <div className="h-44 rounded-card bg-paper" />
        </div>
        <div className="mx-auto w-full max-w-[900px] px-4 pb-4 sm:px-8">
          <div className="h-[62px] rounded-2xl bg-paper" />
        </div>
      </div>
    </div>
  );
}
