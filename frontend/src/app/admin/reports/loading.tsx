import { Skeleton, StatCardsSkeleton } from "@/components/admin/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
      <StatCardsSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-card lg:col-span-2" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}
