"use client";

import { RouteError } from "@/components/dashboard/route-error";

export default function WorkbenchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} home="/admin/analyses" />;
}
