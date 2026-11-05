/** Loading state for the workbench routes: grid on the left, Sage on the right. */
export function WorkbenchSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] flex-col overflow-hidden rounded-card border border-hairline bg-paper lg:h-[calc(100dvh-7.5rem)]" role="status" aria-label="Opening the workbench">
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <div className="h-4 w-64 animate-pulse rounded bg-cloud" />
        <div className="ml-auto h-6 w-36 animate-pulse rounded-full bg-cloud" />
        <div className="h-8 w-28 animate-pulse rounded-ctl bg-cloud" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 space-y-px p-2">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded-sm bg-cloud/70" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
          ))}
        </div>
        <div className="hidden w-[410px] space-y-3 border-l border-hairline p-3 lg:block">
          <div className="h-40 animate-pulse rounded-card bg-cloud" />
          <div className="h-24 animate-pulse rounded-card bg-cloud" />
        </div>
      </div>
      <span className="sr-only">Opening the workbench…</span>
    </div>
  );
}
