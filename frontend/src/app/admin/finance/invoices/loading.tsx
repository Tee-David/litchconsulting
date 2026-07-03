import { Skeleton, StatCardsSkeleton, TableSkeleton } from "@/components/admin/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <StatCardsSkeleton />
      <TableSkeleton />
    </div>
  );
}
