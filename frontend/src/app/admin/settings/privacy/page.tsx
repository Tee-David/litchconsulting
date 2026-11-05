import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/admin/ui/surface";
import { ACTIVITIES, LAWFUL_BASIS, PROCESSORS } from "@/lib/privacy/register";

export const metadata: Metadata = { title: "Data processing register" };

/**
 * Settings → Privacy (NDPA record of processing). Read-only: generated from
 * lib/privacy/register.ts, which changes in code review with the features it
 * describes. The Settings layout owns the title and the admin gate.
 */
export default function PrivacyRegisterPage() {
  const byId = new Map(PROCESSORS.map((p) => [p.id, p]));
  return (
    <div className="mt-5 space-y-5">
      <p className="max-w-[75ch] text-[15px] text-body">
        What personal data the platform processes, why, under which lawful basis, with which processors and for how long. It is generated from the code, so it changes when the product does. The public version is the{" "}
        <Link href="/legal/privacy-policy" className="font-medium text-accent hover:underline">
          privacy policy
        </Link>
        ; client erasure requests are on each client&apos;s Privacy tab.
      </p>

      <Panel title="Processing activities" sub={String(ACTIVITIES.length)} bodyClassName="p-0">
        <ul className="divide-y divide-hairline">
          {ACTIVITIES.map((a) => (
            <li key={a.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-[15px] font-semibold text-ink">{a.name}</h3>
                <span className="text-[12.5px] text-muted">{LAWFUL_BASIS[a.basis]}</span>
              </div>
              <p className="mt-1 text-sm text-body">{a.purpose}</p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-muted">People</dt>
                <dd className="text-ink">{a.subjects}</dd>
                <dt className="text-muted">Data</dt>
                <dd className="text-ink">{a.categories.join(" · ")}</dd>
                <dt className="text-muted">Processors</dt>
                <dd className="text-ink">{a.processors.map((id) => byId.get(id)?.name ?? id).join(", ")}</dd>
                <dt className="text-muted">Retention</dt>
                <dd className="text-ink">{a.retention}</dd>
                <dt className="text-muted">How it is applied</dt>
                <dd className="text-ink">{a.enforcement}</dd>
                <dt className="text-muted">Stored in</dt>
                <dd className="break-words font-mono text-[12.5px] text-body">{a.where}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Processors" sub={String(PROCESSORS.length)} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[12.5px] text-muted">
                <th className="px-4 py-2.5 font-medium sm:px-5">Processor</th>
                <th className="px-3 py-2.5 font-medium">What it does for us</th>
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 font-medium">Safeguard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {PROCESSORS.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-ink sm:px-5">{p.name}</td>
                  <td className="px-3 py-3 text-body">{p.role}</td>
                  <td className="px-3 py-3 text-body">{p.location}</td>
                  <td className="px-3 py-3 text-body">{p.transferSafeguard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
