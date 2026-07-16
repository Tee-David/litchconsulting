/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** Shared initials logic (previously copy-pasted across topbars/helpdesk). */
export function initialsOf(name?: string | null, email?: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "A";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Initials avatar (image when available). Brand circle, sized via `size`
 * (Tailwind size-N number, default 9 = 36px).
 */
export function Avatar({
  name,
  email,
  image,
  size = 9,
  className,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand font-semibold text-white ring-2 ring-hairline keep-brand",
        size >= 12 ? "text-base" : "text-xs",
        className
      )}
    >
      {image ? (
        <img src={image} alt={name || "avatar"} className="size-full object-cover" />
      ) : (
        initialsOf(name, email)
      )}
    </span>
  );
}

/** "3h ago"-style relative time for feeds/worklists. */
export function timeAgo(iso: string | Date) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
