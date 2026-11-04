"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} home="/dashboard" />;
}
