import { FileArchive, FileSpreadsheet, FileText, ImageIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Attachment chips on a sent message (after shadcn.io/ai "Attachment"): a type
 * icon, the name (truncated) and the kind. Several chips wrap under the bubble;
 * on a phone a long row scrolls sideways.
 */
function kindOf(name: string): { icon: LucideIcon; label: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (/^pasted text/i.test(name)) return { icon: FileText, label: "Pasted text" };
  if (["xlsx", "xls", "xlsm", "csv", "ods"].includes(ext)) return { icon: FileSpreadsheet, label: ext.toUpperCase() };
  if (["zip", "rar", "7z"].includes(ext)) return { icon: FileArchive, label: ext.toUpperCase() };
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return { icon: ImageIcon, label: "Image" };
  return { icon: FileText, label: ext ? ext.toUpperCase() : "File" };
}

export function SentFiles({ names, className }: { names: string[]; className?: string }) {
  if (!names.length) return null;
  return (
    <ul aria-label="Files sent with this question" className={cn("flex max-w-full flex-wrap justify-end gap-1.5", className)}>
      {names.map((n) => {
        const k = kindOf(n);
        const Icon = k.icon;
        return (
          <li key={n} className="flex min-h-9 max-w-[15rem] items-center gap-2 rounded-xl border border-hairline bg-paper py-1 pl-1.5 pr-2.5" title={n}>
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface text-muted" aria-hidden>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-ink">{n}</span>
              <span className="block text-[10.5px] text-muted">{k.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
