import { Mail, Cloud, Database, Globe, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";

export const dynamic = "force-dynamic";

const has = (...keys: string[]) => keys.some((k) => Boolean(process.env[k]));

export default function IntegrationsPage() {
  const integrations = [
    { name: "Email (SMTP)", desc: "Transactional email for invoices & password resets.", icon: Mail, on: has("SMTP_HOST") },
    { name: "Cloudflare R2", desc: "Storage for documents, templates and brand assets.", icon: Cloud, on: has("R2_ACCOUNT_ID") },
    { name: "CockroachDB", desc: "Primary application database.", icon: Database, on: has("DATABASE_URL", "COCKROACHDB_URL") },
    { name: "Google OAuth", desc: "Social sign-in for clients.", icon: Globe, on: has("GOOGLE_CLIENT_ID") },
    { name: "Paystack", desc: "Collect invoice payments online.", icon: CreditCard, on: has("PAYSTACK_SECRET_KEY") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" description="Connected services powering Litch. Managed via environment configuration." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((i) => (
          <div key={i.name} className="rounded-card border border-hairline bg-paper p-5">
            <div className="flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand">
                <i.icon className="size-5" />
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  i.on
                    ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                    : "bg-surface text-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {i.on ? "Connected" : "Not configured"}
              </span>
            </div>
            <h3 className="mt-4 font-display text-sm font-bold text-ink">{i.name}</h3>
            <p className="mt-1 text-sm text-body">{i.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
