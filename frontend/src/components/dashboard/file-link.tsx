import type { ReactNode } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { extLabel } from "@/lib/files";
import { cn } from "@/lib/utils";

/**
 * One file row with a download link. `href` points at an ownership-checked
 * route that redirects to a 60-second presigned URL (never a public URL).
 */
export function FileLink({ href, name, meta, chip, blocked, action }: { href: string; name: string; meta?: ReactNode; chip?: ReactNode; blocked?: boolean; action?: ReactNode }) {
  const ext = extLabel(name);
  return (
    <div className="flex items-center gap-3 rounded-ctl border border-hairline bg-paper px-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-10 shrink-0 place-items-center rounded-md text-[10px] font-bold",
          ext === "PDF" ? "bg-bad-soft text-bad" : ext === "XLSX" || ext === "CSV" ? "bg-good-soft text-good" : "bg-info-soft text-info",
        )}
      >
        {ext}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={name}>{name}</p>
        {meta ? <p className="truncate text-xs text-muted">{meta}</p> : null}
      </div>
      {chip}
      {action}
      {blocked ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-bad" title="This file failed the virus scan and cannot be downloaded.">
          <ShieldAlert className="size-4" aria-hidden /> Blocked
        </span>
      ) : (
        <a href={href} aria-label={`Download ${name}`} className="grid size-9 shrink-0 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink">
          <Download className="size-4" />
        </a>
      )}
    </div>
  );
}
