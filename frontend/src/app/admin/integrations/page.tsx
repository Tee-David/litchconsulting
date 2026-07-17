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
import { PageHeader } from "@/components/admin/ui/page-header";
import { getIntegrationStatuses, type IntegrationState, type IntegrationStatus } from "@/lib/integrations/status";
import { cn } from "@/lib/utils";

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
  connected: {
    label: "Connected",
    pill: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "Needs attention",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  not_configured: { label: "Not configured", pill: "bg-surface text-muted", dot: "bg-muted" },
  unknown: { label: "Unknown", pill: "bg-surface text-muted", dot: "bg-muted" },
};

const GROUP_ORDER = ["Payments & scheduling", "Communications", "Storage & data", "LitchAI", "Platform"] as const;

function StatusPill({ state }: { state: IntegrationState }) {
  const meta = STATE_META[state];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.pill)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function IntegrationCard({ item }: { item: IntegrationStatus }) {
  const Icon = ICONS[item.key] ?? Cable;
  return (
    <div className="flex flex-col rounded-card border border-hairline bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
          <Icon className="size-5" />
        </span>
        <StatusPill state={item.state} />
      </div>

      <h3 className="mt-4 font-display text-sm font-bold text-ink">{item.name}</h3>
      <p className="mt-1 text-sm text-body">{item.description}</p>

      {/* The evidence behind the pill — why it says what it says. */}
      <p
        className={cn(
          "mt-3 text-xs leading-relaxed",
          item.state === "degraded" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted"
        )}
      >
        {item.detail}
      </p>

      <div className="mt-auto space-y-3 pt-4">
        {/* Env var NAMES only — never values. A chip shows the alias actually
            in use when one is set, otherwise every name that would satisfy it. */}
        {item.envKeys.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.envKeys.map((k) => (
              <code
                key={k.names[0]}
                title={
                  k.set
                    ? `${k.using} is set`
                    : k.names.length > 1
                      ? `Not set — accepts any of: ${k.names.join(", ")}`
                      : `${k.names[0]} is not set`
                }
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                  k.set
                    ? "border-hairline bg-surface text-body"
                    : "border-dashed border-hairline text-muted line-through decoration-muted/50"
                )}
              >
                {k.set ? k.using : k.names.join(" / ")}
              </code>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3 text-xs">
          <span className="text-muted">
            {item.probed ? (
              <>
                Live check{typeof item.latencyMs === "number" ? ` · ${item.latencyMs}ms` : ""}
              </>
            ) : (
              "Config check"
            )}
          </span>
          <div className="flex items-center gap-3">
            {item.configHref && (
              <Link href={item.configHref} className="inline-flex items-center gap-0.5 font-semibold text-brand hover:underline">
                Open <ArrowRight className="size-3" />
              </Link>
            )}
            {item.docsUrl && (
              <a
                href={item.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-muted transition-colors hover:text-ink"
              >
                Docs <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
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
      <PageHeader
        title="Integrations"
        description="Live status for every service the platform depends on. Checked on each page load — nothing here is cached."
      />

      {/* Roll-up. Anything amber is actionable; grey is simply switched off. */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-hairline bg-paper px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {counts.connected} connected
        </span>
        <span className="text-hairline">·</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            counts.degraded > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted"
          )}
        >
          <span className={cn("size-1.5 rounded-full", counts.degraded > 0 ? "bg-amber-500" : "bg-muted")} />
          {counts.degraded} need{counts.degraded === 1 ? "s" : ""} attention
        </span>
        <span className="text-hairline">·</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-muted">
          <span className="size-1.5 rounded-full bg-muted" />
          {counts.missing} not configured
        </span>
        <span className="ml-auto text-xs text-muted">
          Managed through environment config (repo-root <code className="font-mono">.env</code> + Doppler → Vercel).
        </span>
      </div>

      {groups.map((group, gi) => (
        <section key={group.name} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{group.name}</h2>
          {/* The guided tour spotlights the first grid — one stable anchor. */}
          <div
            data-tour={gi === 0 ? "integrations-grid" : undefined}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {group.items.map((item) => (
              <IntegrationCard key={item.key} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
