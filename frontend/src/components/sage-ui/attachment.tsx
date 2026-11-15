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

/** "pack.zip [a.xlsx; b.csv]" → the archive and the files it unpacked (File Tree). */
function splitArchive(n: string): { name: string; inner: string[] } {
  const m = /^(.*\.(?:zip|rar|7z)) \[(.*)\]$/i.exec(n);
  return m ? { name: m[1], inner: m[2].split("; ").filter(Boolean) } : { name: n, inner: [] };
}

export function SentFiles({ names, className }: { names: string[]; className?: string }) {
  if (!names.length) return null;
  return (
    <ul aria-label="Files sent with this question" className={cn("flex max-w-full flex-wrap justify-end gap-1.5", className)}>
      {names.map((raw) => {
        const { name: n, inner } = splitArchive(raw);
        const k = kindOf(n);
        const Icon = k.icon;
        return (
          <li key={raw} className="max-w-[15rem] rounded-xl border border-hairline bg-paper py-1 pl-1.5 pr-2.5" title={n}>
            <span className="flex min-h-7 items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface text-muted" aria-hidden>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-ink">{n}</span>
                <span className="block text-[10.5px] text-muted">{inner.length ? `${k.label} · ${inner.length} file${inner.length === 1 ? "" : "s"} unpacked` : k.label}</span>
              </span>
            </span>
            {inner.length ? (
              // File Tree (shadcn.io/ai): what the archive held.
              <ul aria-label={`Files in ${n}`} className="mb-1 ml-[11px] mt-1 border-l border-hairline pl-3">
                {inner.slice(0, 12).map((f) => {
                  const fk = kindOf(f);
                  const FIcon = fk.icon;
                  return (
                    <li key={f} className="flex min-h-6 items-center gap-1.5 text-[11.5px] text-body" title={f}>
                      <FIcon className="size-3 shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{f}</span>
                    </li>
                  );
                })}
                {inner.length > 12 ? <li className="text-[11px] text-muted">and {inner.length - 12} more</li> : null}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
