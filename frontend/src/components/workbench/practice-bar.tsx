"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, RotateCcw } from "lucide-react";
import { openPracticeAction } from "@/lib/workbench/practice-actions";
import { useToast } from "@/components/admin/ui/toaster";

/** The strip on a practice workbook: what it is, and a way to start again. */
export function PracticeBar() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline bg-info-soft px-3 py-2 text-[12.5px] text-ink sm:px-4" role="note">
      <GraduationCap className="size-4 shrink-0 text-info" aria-hidden />
      <p className="min-w-0 flex-1">
        <b className="font-semibold">Practice workbook.</b> Sample figures for a made-up company. Edit, format and ask Sage freely: no client data is here.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await openPracticeAction(true);
          setBusy(false);
          if (!res.ok) return toast.error(res.error);
          router.push(res.href);
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 font-medium text-accent hover:bg-paper disabled:opacity-50 dark:text-info"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        {busy ? "Starting again…" : "Start again"}
      </button>
    </div>
  );
}
