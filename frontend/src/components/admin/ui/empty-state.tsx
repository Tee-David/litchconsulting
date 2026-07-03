import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Centered empty/placeholder state for sections with no data yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-paper px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-brand-tint text-brand">
          <Icon className="size-6" />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-body">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
