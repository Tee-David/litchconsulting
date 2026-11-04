"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState, Button } from "@/components/kit";

/** Error boundary for every admin page: says what happened and offers a retry. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);
  return (
    <div className="rounded-card border border-hairline bg-paper">
      <EmptyState
        icon={<AlertTriangle />}
        title="This page did not load"
        why={
          <>
            Something failed while fetching its data, usually a dropped database connection. Your work is saved.
            {error.digest ? <span className="mt-1 block text-xs text-muted">Reference {error.digest}</span> : null}
          </>
        }
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
