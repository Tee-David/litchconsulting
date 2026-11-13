import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Page furniture for the redesigned firm dashboard: page head, panel (card
 * with a header), KPI tile, key/value list and tabs-as-links. Server-safe.
 */

export function PageHead({
  title,
  lede,
  actions,
  meta,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** Chips beside the title (status, mode). */
  meta?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
          {meta}
        </div>
        {lede ? <p className="mt-1 max-w-[70ch] text-[15px] text-body">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  sub,
  action,
  children,
  className,
  bodyClassName,
  tour,
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tour?: string;
  id?: string;
}) {
  return (
    <section id={id} data-tour={tour} className={cn("min-w-0 rounded-card border border-hairline bg-paper", className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-5">
          <h2 className="font-display text-[15px] font-semibold text-ink">
            {title}
            {sub ? <span className="ml-2 text-sm font-normal text-muted">{sub}</span> : null}
          </h2>
          {action}
        </header>
      ) : null}
      <div className={cn("px-4 py-4 sm:px-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI tile: label, figure and a short note. No sparkline: KPI cards stay figures only (owner decision). */
export function Kpi({
  label,
  value,
  note,
  noteTone,
  href,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  noteTone?: "good" | "bad" | "warn" | "muted";
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-body">{label}</p>
      <p className="mt-1.5 font-display text-[1.6rem] font-bold tabular-nums leading-none text-ink">{value}</p>
      {note ? (
        <p
          className={cn(
            "mt-2 text-[13px]",
            noteTone === "good" ? "text-good" : noteTone === "bad" ? "text-bad" : noteTone === "warn" ? "text-warn" : "text-muted",
          )}
        >
          {note}
        </p>
      ) : null}
    </>
  );
  const cls = "block min-w-0 rounded-card border border-hairline bg-paper p-4 sm:p-5";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/40 outline-none")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KeyValues({ rows, className }: { rows: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabs that are links (each tab has its own URL, so Back works). */
export function LinkTabs({
  tabs,
  active,
  label,
}: {
  tabs: Array<{ id: string; label: string; href: string; count?: number }>;
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-hairline">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                scroll={false}
                className={cn(
                  "-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  on ? "border-act text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.label}
                {typeof t.count === "number" && t.count > 0 ? (
                  <span className="rounded-full bg-surface px-1.5 text-xs tabular-nums text-ink">{t.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Primary action as a link (one per view). */
export function ActLink({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 [&_svg]:size-4",
        variant === "primary" ? "keep-brand bg-act font-semibold text-act-ink hover:bg-act-hover" : "border border-line-strong bg-paper text-ink hover:bg-surface",
        className,
      )}
    >
      {children}
    </Link>
  );
}
