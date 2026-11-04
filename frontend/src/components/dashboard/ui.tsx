import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/* Server-safe building blocks shared by the staff and client dashboards. */

export function PageHead({
  title,
  lede,
  back,
  crumbs,
  actions,
  chip,
}: {
  title: ReactNode;
  lede?: ReactNode;
  back?: { href: string; label: string };
  crumbs?: Array<{ href?: string; label: string }>;
  actions?: ReactNode;
  chip?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted">
            {crumbs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {c.href ? (
                  <Link href={c.href} className="hover:text-ink hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-body">{c.label}</span>
                )}
                {i < crumbs.length - 1 ? <ChevronRight aria-hidden className="size-3.5" /> : null}
              </span>
            ))}
          </nav>
        ) : back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden /> {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {chip}
        </div>
        {lede ? <p className="mt-1.5 max-w-2xl text-[15px] text-body">{lede}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  sub,
  right,
  children,
  className,
  bodyClass,
  id,
  tour,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  id?: string;
  tour?: string;
}) {
  return (
    <section id={id} data-tour={tour} className={cn("rounded-card border border-hairline bg-paper", className)}>
      {title ? (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3 sm:px-5">
          <h2 className="font-display text-base font-semibold text-ink">
            {title}
            {sub ? <span className="ml-2 text-sm font-normal text-muted">{sub}</span> : null}
          </h2>
          {right ? <div className="ml-auto">{right}</div> : null}
        </header>
      ) : null}
      <div className={cn("px-4 py-4 sm:px-5", bodyClass)}>{children}</div>
    </section>
  );
}

export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="divide-y divide-hairline text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = "info", title, children, action }: { tone?: "info" | "good" | "warn" | "bad"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const t = {
    info: "border-info/25 bg-info-soft text-info",
    good: "border-good/25 bg-good-soft text-good",
    warn: "border-warn/25 bg-warn-soft text-warn",
    bad: "border-bad/25 bg-bad-soft text-bad",
  }[tone];
  const Icon = tone === "good" ? Check : tone === "info" ? Info : CircleAlert;
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center", t)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 text-sm">
          {title ? <p className="font-semibold text-ink">{title}</p> : null}
          {children ? <div className="text-body">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 pl-8 sm:pl-0">{action}</div> : null}
    </div>
  );
}

/** "Your move" card at the top of a request. */
export function NextMove({ icon, title, body, action }: { icon: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-card border border-hairline bg-paper p-4 sm:flex-row sm:items-center sm:p-5">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-ctl bg-brand-tint text-ink [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {body ? <p className="mt-0.5 text-sm text-body">{body}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export type Step = { label: string; sub?: string; state: "done" | "current" | "wait" | "upcoming" };

/** Horizontal on ≥ sm, vertical on phones. `wait` = current and it is the viewer's move. */
export function Stepper({ steps, label = "Progress" }: { steps: Step[]; label?: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-0 sm:flex-row sm:items-start">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} aria-current={s.state === "current" || s.state === "wait" ? "step" : undefined} className="relative flex gap-3 pb-5 sm:flex-1 sm:flex-col sm:gap-2 sm:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-28px)] w-0.5 sm:left-7 sm:top-[13px] sm:h-0.5 sm:w-[calc(100%-28px)]",
                  s.state === "done" ? "bg-good" : "bg-hairline",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
                s.state === "done" && "border-good bg-good text-paper",
                s.state === "current" && "border-info bg-info-soft text-info",
                s.state === "wait" && "border-warn bg-warn-soft text-warn",
                s.state === "upcoming" && "border-line-strong bg-paper text-muted",
              )}
            >
              {s.state === "done" ? <Check className="size-3.5" aria-hidden /> : i + 1}
              <span className="sr-only">{s.state === "done" ? "done" : s.state === "upcoming" ? "not started" : s.state === "wait" ? "your move" : "in progress"}</span>
            </span>
            <span className="min-w-0 pt-0.5 sm:pt-0">
              <span className={cn("block text-sm font-semibold", s.state === "upcoming" ? "text-muted" : "text-ink")}>{s.label}</span>
              {s.sub ? <span className="block text-xs text-muted">{s.sub}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Link-based tabs (server-rendered, shareable URLs). */
export function LinkTabs({ tabs, active, label }: { tabs: Array<{ id: string; label: string; href: string; count?: number }>; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-hairline">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                data-tour={`tab-${t.id}`}
                className={cn(
                  "relative inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  on ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.count ? <span className="rounded-full bg-surface px-1.5 text-xs tabular-nums text-body">{t.count}</span> : null}
                {on ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-act" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const linkBtn = {
  primary: "inline-flex h-10 items-center justify-center gap-1.5 rounded-ctl bg-act px-4 text-sm font-semibold text-act-ink hover:bg-act-hover outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
  secondary: "inline-flex h-10 items-center justify-center gap-1.5 rounded-ctl border border-line-strong bg-paper px-3.5 text-sm font-medium text-ink hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
  small: "inline-flex h-8 items-center justify-center gap-1.5 rounded-ctl border border-line-strong bg-paper px-2.5 text-[13px] font-medium text-ink hover:bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
  ghost: "inline-flex h-9 items-center gap-1 rounded-ctl px-2 text-sm font-medium text-accent hover:underline",
};

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-card bg-surface", className)} />;
}

/** Loading layout for any dashboard page. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const s = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-ink", className)}>
      {s || "?"}
    </span>
  );
}
