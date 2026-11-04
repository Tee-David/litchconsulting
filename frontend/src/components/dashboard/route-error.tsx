"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/kit";

/** Shared error boundary body for the staff and client dashboards. */
export function RouteError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-bad-soft text-bad">
        <CircleAlert className="size-5" aria-hidden />
      </span>
      <h1 className="font-display text-lg font-semibold text-ink">This page did not load</h1>
      <p className="mt-1 text-sm text-body">
        Something went wrong while fetching your data. Try again. If it keeps happening, send us reference{" "}
        <span className="font-mono text-ink">{error.digest ?? "n/a"}</span>.
      </p>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <Link href={home} className="inline-flex h-10 items-center rounded-ctl border border-line-strong px-3.5 text-sm font-medium text-ink hover:bg-surface">
          Go home
        </Link>
      </div>
    </div>
  );
}
