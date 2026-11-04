"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, Clock, Link2 } from "lucide-react";
import { formatMoney } from "@/lib/invoice/money";
import { RequestStepper } from "@/components/requests/request-stepper";
import type { StepperService } from "@/components/requests/stepper-utils";
import { loadRequestDraft, type RequestDraft } from "@/components/requests/draft";
import { cn } from "@/lib/utils";

type Parent = { id: string; number: string; serviceName: string; serviceSlug: string; files: Array<{ id: string; name: string; from: "us" | "you" }> };

export function NewRequestClient({ services, parent = null, addMode = false }: { services: StepperService[]; parent?: Parent | null; addMode?: boolean }) {
  const params = useSearchParams();
  const resume = params.get("resume") === "1";
  const preselect = params.get("service") ?? (parent && !addMode && services.some((s) => s.slug === parent.serviceSlug) ? parent.serviceSlug : null);

  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [slug, setSlug] = useState<string | null>(preselect);
  const [carry, setCarry] = useState<Set<string>>(new Set(parent?.files.map((f) => f.id) ?? []));

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
    <div>
      <div className="mb-6">
        {selected ? (
          <button type="button" onClick={() => setSlug(null)} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden /> All services
          </button>
        ) : (
          <Link href="/dashboard/requests" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden /> Requests
          </Link>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
          {selected ? `Request ${selected.name}` : parent ? "Add a service" : "What do you need help with?"}
        </h1>
        <p className="mt-1.5 text-[15px] text-body">
          {selected ? "Tell us about the work. Fixed-price services go straight to payment; the rest get a quote within a working day." : "Pick one. Fixed-price services show the price; the rest get a quote within a working day."}
        </p>
        {draft && selected ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-good">
            <CheckCircle2 className="size-4" aria-hidden /> Welcome back. We saved where you left off.
          </p>
        ) : null}
      </div>

      {parent ? (
        <section className="mb-6 rounded-card border border-hairline bg-paper p-4 sm:p-5" aria-label="Follow-on">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Link2 className="size-4 text-muted" aria-hidden /> Linked to {parent.number} · {parent.serviceName}
          </p>
          {parent.files.length ? (
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm text-body">Bring these files along</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {parent.files.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm text-body">
                    <input
                      type="checkbox"
                      checked={carry.has(f.id)}
                      onChange={(e) =>
                        setCarry((c) => {
                          const n = new Set(c);
                          if (e.target.checked) n.add(f.id);
                          else n.delete(f.id);
                          return n;
                        })
                      }
                      className="size-4 accent-[var(--color-act)]"
                    />
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted">{f.from === "us" ? "from us" : "yours"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="mt-1 text-sm text-muted">No files on the earlier request to carry over.</p>
          )}
        </section>
      ) : null}

      {selected ? (
        <RequestStepper
          service={selected}
          mode="portal"
          initialDraft={draft}
          initialStep={draft ? 2 : 0}
          followOn={parent ? { parentRequestId: parent.id, carryDocumentIds: [...carry] } : null}
        />
      ) : (
        <div data-tour="service-picker" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => setSlug(s.slug)}
              className={cn(
                "flex flex-col rounded-card border border-hairline bg-paper p-4 text-left outline-none transition-colors hover:border-line-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40",
              )}
            >
              <b className="font-display text-base font-semibold text-ink">{s.name}</b>
              <span className="mt-1 flex-1 text-sm text-body">{s.tagline}</span>
              <span className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{s.pricingMode === "fixed" && s.priceNgn ? `From ${formatMoney(Number(s.priceNgn))}` : "Quote"}</span>
                {s.turnaround ? (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Clock className="size-3.5" aria-hidden /> {s.turnaround}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">
        Not sure which service you need?{" "}
        <Link href="/book" className="font-medium text-accent hover:underline">
          Book a call
        </Link>
        .
      </p>
    </div>
  );
}
