import Link from "next/link";
import {
  Mail,
  Cloud,
  Database,
  Globe,
  CreditCard,
  CalendarClock,
  BellRing,
  Bot,
  Cable,
  KeyRound,
  Lock,
  Timer,
  ExternalLink,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { getIntegrationStatuses, type IntegrationState, type IntegrationStatus } from "@/lib/integrations/status";
import { cn } from "@/lib/utils";
import { AiUsage } from "@/components/workbench/ai-usage";

export const dynamic = "force-dynamic";

const ICONS: Record<string, LucideIcon> = {
  paystack: CreditCard,
  calcom: CalendarClock,
  smtp: Mail,
  vapid: BellRing,
  "r2-public": Cloud,
  "r2-private": Lock,
  cockroach: Database,
  "litchai-tunnel": Cable,
  "litchai-model": Bot,
  "better-auth": KeyRound,
  "google-oauth": Globe,
  doppler: KeyRound,
  "vercel-cron": Timer,
};

const STATE_META: Record<IntegrationState, { label: string; pill: string; dot: string }> = {
  connected: { label: "Connected", pill: "bg-good-soft text-good", dot: "bg-good" },
  degraded: { label: "Needs attention", pill: "bg-warn-soft text-warn", dot: "bg-warn" },
  not_configured: { label: "Not configured", pill: "bg-surface text-muted", dot: "bg-faint" },
  unknown: { label: "Unknown", pill: "bg-surface text-muted", dot: "bg-faint" },
};

const GROUP_ORDER = ["Payments & scheduling", "Communications", "Storage & data", "LitchAI", "Platform"] as const;

function StatusPill({ state }: { state: IntegrationState }) {
  const meta = STATE_META[state];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.pill)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

/**
 * One service as one row: what it is, why the status says what it says, and one
 * action (open its settings, or its docs). Env var names (never values) sit in a
 * tooltip and on wide screens.
 */
function IntegrationRow({ item }: { item: IntegrationStatus }) {
  const Icon = ICONS[item.key] ?? Cable;
  const keys = item.envKeys.map((k) => (k.set ? `${k.using} set` : `${k.names.join(" / ")} not set`)).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <span className="keep-brand grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white dark:bg-info dark:text-paper" aria-hidden>
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 basis-[12rem]" title={keys || undefined}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
          {item.name}
          <StatusPill state={item.state} />
        </p>
        <p className={cn("mt-0.5 text-[12.5px] leading-snug", item.state === "degraded" ? "font-medium text-warn" : "text-body")}>{item.detail}</p>
        {keys ? <p className="mt-0.5 hidden truncate font-mono text-[11px] text-muted lg:block">{keys}</p> : null}
      </div>
      <span className="hidden shrink-0 text-xs tabular-nums text-muted md:inline">
        {item.probed ? `Live check${typeof item.latencyMs === "number" ? ` · ${item.latencyMs} ms` : ""}` : "Config check"}
      </span>
      {item.configHref ? (
        <Link href={item.configHref} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-ctl border border-hairline px-3 text-[13px] font-medium text-ink hover:bg-surface">
          Open <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : item.docsUrl ? (
        <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-ctl border border-hairline px-3 text-[13px] font-medium text-ink hover:bg-surface">
          Docs <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

export default async function IntegrationsPage() {
  const items = await getIntegrationStatuses();

  const counts = {
    connected: items.filter((i) => i.state === "connected").length,
    degraded: items.filter((i) => i.state === "degraded").length,
    missing: items.filter((i) => i.state === "not_configured").length,
  };
  const groups = GROUP_ORDER.map((g) => ({ name: g, items: items.filter((i) => i.group === g) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-body">Live status for every service the platform depends on, checked on each page load.</p>

      {/* Roll-up. Anything amber is actionable; grey is simply switched off. */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-hairline bg-paper px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span className="size-1.5 rounded-full bg-good" />
          {counts.connected} connected
        </span>
        <span className="text-hairline">·</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            counts.degraded > 0 ? "text-warn" : "text-muted"
          )}
        >
          <span className={cn("size-1.5 rounded-full", counts.degraded > 0 ? "bg-warn" : "bg-faint")} />
          {counts.degraded} need{counts.degraded === 1 ? "s" : ""} attention
        </span>
        <span className="text-hairline">·</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-muted">
          <span className="size-1.5 rounded-full bg-faint" />
          {counts.missing} not configured
        </span>
        <span className="ml-auto text-xs text-muted">
          Managed through environment config (repo-root <code className="font-mono">.env</code> + Doppler → Vercel).
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">AI model usage</h2>
        <div className="max-w-xl">
          <AiUsage canEdit />
        </div>
      </section>

      {groups.map((group, gi) => (
        <section key={group.name} className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">{group.name}</h2>
          {/* The guided tour spotlights the first list: one stable anchor. */}
          <ul
            data-tour={gi === 0 ? "integrations-grid" : undefined}
            className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-paper"
          >
            {group.items.map((item) => (
              <IntegrationRow key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
