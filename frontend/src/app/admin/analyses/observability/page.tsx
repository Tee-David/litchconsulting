import Link from "next/link";
import { ArrowLeft, Activity } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { getObservability, type Observability } from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-hairline bg-surface/50 p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export default async function ObservabilityPage() {
  let data: Observability | null = null;
  let error: string | null = null;
  try {
    data = await getObservability();
  } catch (e) {
    error = e instanceof Error ? e.message : "LitchAI backend unreachable";
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/analyses"
        className="inline-flex items-center gap-1 text-sm text-body hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back to documents
      </Link>
      <PageHeader title="LitchAI observability" description="Pipeline health at a glance." />

      {error || !data ? (
        <EmptyState icon={Activity} title="Metrics unavailable" description={error ?? "No data."} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-4">
            <Stat label="Documents" value={data.documents_total} />
            <Stat label="Rejected" value={data.documents_rejected} />
            <Stat label="Needs review" value={data.needs_review_total} />
            <Stat label="Rung-4 fallback" value={`${(data.rung4_fallback_rate * 100).toFixed(1)}%`} />
          </div>

          <div className="rounded-card border border-hairline p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Per-rung hit rates</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-medium">Rung</th>
                  <th className="pb-2 font-medium">Seen</th>
                  <th className="pb-2 font-medium">Accepted</th>
                  <th className="pb-2 font-medium">Hit rate</th>
                </tr>
              </thead>
              <tbody>
                {data.rung_hit_rates.map((r) => (
                  <tr key={r.rung} className="border-t border-hairline">
                    <td className="py-2 text-ink">{r.rung}</td>
                    <td className="py-2 tabular-nums text-body">{r.seen}</td>
                    <td className="py-2 tabular-nums text-body">{r.accepted}</td>
                    <td className="py-2 tabular-nums text-body">{(r.hit_rate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-card border border-hairline p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Documents by status</h3>
            <ul className="flex flex-wrap gap-2 text-sm">
              {Object.entries(data.documents_by_status).map(([status, n]) => (
                <li key={status} className="rounded-full bg-surface px-3 py-1 text-body">
                  {status}: <span className="font-semibold text-ink">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
