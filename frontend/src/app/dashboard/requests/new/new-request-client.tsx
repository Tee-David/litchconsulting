"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock } from "lucide-react";
import { formatMoney } from "@/lib/invoice/money";
import { RequestStepper } from "@/components/requests/request-stepper";
import type { StepperService } from "@/components/requests/stepper-utils";
import { loadRequestDraft, type RequestDraft } from "@/components/requests/draft";

export function NewRequestClient({ services }: { services: StepperService[] }) {
  const params = useSearchParams();
  const preselect = params.get("service");
  const resume = params.get("resume") === "1";

  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [slug, setSlug] = useState<string | null>(preselect);

  // Draft pickup happens client-side only (localStorage).
  useEffect(() => {
    if (resume) {
      const d = loadRequestDraft();
      if (d && services.some((s) => s.slug === d.serviceSlug)) {
        setDraft(d);
        setSlug(d.serviceSlug);
      }
    }
    setReady(true);
  }, [resume, services]);

  if (!ready) return null;

  const selected = slug ? services.find((s) => s.slug === slug) : null;

  return (
    <div className="space-y-6">
      <div className="border-b border-hairline pb-5">
        {selected ? (
          <button
            type="button"
            onClick={() => setSlug(null)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> All services
          </button>
        ) : (
          <Link
            href="/dashboard/requests"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> My Services
          </Link>
        )}
        <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {selected ? `Request ${selected.name}` : "What do you need done?"}
        </h1>
        {draft && selected && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> Welcome back — we saved where you left off.
          </p>
        )}
      </div>

      {selected ? (
        <RequestStepper
          service={selected}
          mode="portal"
          initialDraft={draft}
          initialStep={draft ? 2 : 0}
        />
      ) : (
        <div data-tour="service-picker" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => setSlug(s.slug)}
              className="group flex flex-col rounded-card border border-hairline bg-paper p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-bold text-ink">{s.name}</h3>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <ArrowUpRight className="size-4" />
                </span>
              </div>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-body">{s.tagline}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand">
                  {s.pricingMode === "fixed" && s.priceNgn
                    ? `From ${formatMoney(Number(s.priceNgn))}`
                    : "Get A Quote"}
                </span>
                {s.turnaround && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                    <Clock className="size-3.5" /> {s.turnaround}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
