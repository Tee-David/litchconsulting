import { Skeleton, StatCardsSkeleton } from "@/components/admin/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <StatCardsSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-card border border-hairline bg-paper p-5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-4 h-44 w-full" />
          </div>
          <div className="space-y-3 rounded-card border border-hairline bg-paper p-5">
            <Skeleton className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-card border border-hairline bg-paper p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mx-auto mt-4 size-40 rounded-full" />
          </div>
          <div className="space-y-3 rounded-card border border-hairline bg-paper p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
