"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { saveRequestDraft, clearRequestDraft, type RequestDraft } from "./draft";
import { createRequestAction } from "@/app/dashboard/requests/actions";
import { useToast } from "@/components/admin/ui/toaster";
import type { StepperService } from "./stepper-utils";



const TIMELINES = ["As soon as possible", "Within 2 weeks", "Within a month", "Flexible"];
const COMPANY_SIZES = ["Just me", "2–10 people", "11–50 people", "51–200 people", "200+ people"];

const STEPS = [
  { key: "service", label: "Your service" },
  { key: "brief", label: "Tell us about it" },
  { key: "review", label: "Review & submit" },
] as const;

/**
 * The request wizard (sidebar-progress inspo). Two modes:
 * - "public"  (/request/[slug]): steps 1–2, then the account wall — the draft
 *   is stashed in localStorage and the visitor continues at
 *   /dashboard/requests/new?resume=1 (middleware sends them through
 *   login/signup with the redirect preserved).
 * - "portal"  (/dashboard/requests/new): the full flow — review shows the
 *   priced summary and submit creates the request (fixed-price → straight to
 *   Paystack; quote → confirmation).
 */
export function RequestStepper({
  service,
  mode,
  initialDraft,
  initialStep = 0,
}: {
  service: StepperService;
  mode: "public" | "portal";
  initialDraft?: Pick<RequestDraft, "details" | "intake"> | null;
  /** e.g. resume straight at the review step after the signup round-trip */
  initialStep?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));
  const [details, setDetails] = useState(initialDraft?.details ?? "");
  const [timeline, setTimeline] = useState(initialDraft?.intake?.timeline ?? "");
  const [companySize, setCompanySize] = useState(initialDraft?.intake?.companySize ?? "");
  const [error, setError] = useState<string | null>(null);

  const isFixed = service.pricingMode === "fixed" && service.priceNgn;
  const totals = useMemo(
    () =>
      isFixed
        ? computeTotals([
            { quantity: 1, unitPrice: Number(service.priceNgn), taxRate: Number(service.taxRate) },
          ])
        : null,
    [isFixed, service]
  );

  const requiredDocs = service.requiredDocuments.filter((d) => d.required);

  function next() {
    setError(null);
    if (step === 1 && details.trim().length < 10) {
      setError("Tell us a little more — a couple of sentences helps us start faster.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function continueToAccount() {
    if (details.trim().length < 10) {
      setError("Tell us a little more — a couple of sentences helps us start faster.");
      return;
    }
    saveRequestDraft({
      serviceSlug: service.slug,
      details: details.trim(),
      intake: { timeline: timeline || undefined, companySize: companySize || undefined },
    });
    router.push("/dashboard/requests/new?resume=1");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createRequestAction({
        serviceSlug: service.slug,
        details: details.trim(),
        intake: { timeline: timeline || undefined, companySize: companySize || undefined },
      });
      if (!res.ok) {
        setError(res.error || "Something went wrong — please try again.");
        return;
      }
      clearRequestDraft();
      if (res.payUrl) {
        toast.success("Request created — taking you to secure payment…");
        window.location.href = res.payUrl;
        return;
      }
      if (res.error) toast.toast(res.error);
      router.push(`/dashboard/requests/${res.id}`);
    });
  }

  const lastStep = mode === "public" ? 1 : STEPS.length - 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      {/* Sidebar progress (horizontal bar on mobile) */}
      <aside>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface lg:hidden">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${((step + 1) / (lastStep + 1)) * 100}%` }}
          />
        </div>
        <ol className="hidden lg:block">
          {STEPS.slice(0, mode === "public" ? 2 : 3).map((s, i) => {
            const state = i < step ? "done" : i === step ? "current" : "upcoming";
            return (
              <li key={s.key} className="relative flex gap-3 pb-8 last:pb-0">
                {i < (mode === "public" ? 1 : 2) && (
                  <span className="absolute left-4 top-9 h-[calc(100%-2.25rem)] w-0.5 bg-hairline" />
                )}
                <span
                  className={cn(
                    "z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 bg-paper text-sm font-bold",
                    state === "done" && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
                    state === "current" && "border-brand text-brand keep-brand ring-4 ring-brand/10",
                    state === "upcoming" && "border-hairline text-muted"
                  )}
                >
                  {state === "done" ? <CheckCircle2 className="size-4.5" /> : i + 1}
                </span>
                <div className="pt-1">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      state === "upcoming" ? "text-muted" : "text-ink"
                    )}
                  >
                    {s.label}
                  </p>
                  {state === "current" && (
                    <p className="mt-0.5 text-xs text-body">
                      {i === 0 && "Check this is the right fit."}
                      {i === 1 && "A short brief is all we need."}
                      {i === 2 && (isFixed ? "Confirm and pay securely." : "Confirm your request.")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          {mode === "public" && (
            <li className="relative flex gap-3">
              <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 border-hairline bg-paper text-muted">
                <Lock className="size-3.5" />
              </span>
              <div className="pt-1">
                <p className="text-sm font-semibold text-muted">Create your account</p>
                <p className="mt-0.5 text-xs text-muted">Then pay & track everything.</p>
              </div>
            </li>
          )}
        </ol>
      </aside>

      {/* Step body */}
      <div className="min-w-0">
        {step === 0 && (
          <div className="space-y-5">
            <div className="rounded-card border border-hairline bg-paper p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-ink">{service.name}</h2>
                  <p className="mt-1 text-sm text-body">{service.tagline}</p>
                </div>
                <span className="rounded-full bg-brand-tint px-4 py-1.5 text-sm font-bold text-brand">
                  {isFixed ? `${formatMoney(Number(service.priceNgn))} + VAT` : "Get A Quote"}
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-body">{service.overview}</p>
              {service.turnaround && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2 text-xs font-medium text-body">
                  <Clock className="size-4 text-brand" />
                  Typical turnaround: <span className="font-semibold text-ink">{service.turnaround}</span>
                </p>
              )}
            </div>

            {service.deliverables.length > 0 && (
              <div className="rounded-card border border-hairline bg-paper p-6">
                <h3 className="font-display text-sm font-bold text-ink">What you&apos;ll get</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {service.deliverables.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm text-body">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {requiredDocs.length > 0 && (
              <div className="rounded-card border border-hairline bg-paper p-6">
                <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                  <FileText className="size-4 text-brand" /> You&apos;ll be asked to upload
                </h3>
                <p className="mt-1 text-xs text-muted">
                  {isFixed ? "After payment" : "Once your quote is accepted"} — no need to have these ready now.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {requiredDocs.map((d) => (
                    <li key={d.key} className="text-sm text-body">• {d.label}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="rounded-card border border-hairline bg-paper p-6">
              <label htmlFor="brief" className="font-display text-sm font-bold text-ink">
                What do you need done?
              </label>
              <p className="mt-1 text-xs text-muted">
                A few sentences about your business and what you&apos;re trying to achieve. Plain
                language is perfect.
              </p>
              <textarea
                id="brief"
                rows={6}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={`e.g. "We're a retail business with about 200 monthly transactions. We need our ${service.name.toLowerCase()} sorted for the last financial year…"`}
                className="mt-3 w-full rounded-xl border border-hairline bg-surface p-4 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-card border border-hairline bg-paper p-5">
                <p className="text-sm font-semibold text-ink">When do you need it?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TIMELINES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTimeline(timeline === t ? "" : t)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                        timeline === t
                          ? "border-brand bg-brand text-white keep-brand"
                          : "border-hairline text-body hover:border-brand/40"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-card border border-hairline bg-paper p-5">
                <p className="text-sm font-semibold text-ink">How big is your team?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COMPANY_SIZES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCompanySize(companySize === c ? "" : c)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                        companySize === c
                          ? "border-brand bg-brand text-white keep-brand"
                          : "border-hairline text-body hover:border-brand/40"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && mode === "portal" && (
          <div className="space-y-5">
            <div className="rounded-card border border-hairline bg-paper p-6">
              <h3 className="font-display text-sm font-bold text-ink">Your request</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-hairline pb-3">
                  <dt className="text-muted">Service</dt>
                  <dd className="text-right font-semibold text-ink">{service.name}</dd>
                </div>
                {timeline && (
                  <div className="flex justify-between gap-4 border-b border-hairline pb-3">
                    <dt className="text-muted">Timeline</dt>
                    <dd className="font-semibold text-ink">{timeline}</dd>
                  </div>
                )}
                <div className="pt-1">
                  <dt className="mb-1.5 text-muted">Your brief</dt>
                  <dd className="rounded-xl border border-hairline bg-surface p-3 text-xs leading-relaxed text-body">
                    {details}
                  </dd>
                </div>
              </dl>
            </div>

            {isFixed && totals ? (
              <div className="rounded-card border border-hairline bg-paper p-6">
                <h3 className="font-display text-sm font-bold text-ink">Payment summary</h3>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-body">{service.name}</dt>
                    <dd className="tabular-nums text-ink">{formatMoney(totals.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-body">VAT ({service.taxRate}%)</dt>
                    <dd className="tabular-nums text-ink">{formatMoney(totals.taxTotal)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-hairline pt-3">
                    <dt className="font-display font-bold text-ink">Total due now</dt>
                    <dd className="font-display text-lg font-bold tabular-nums text-ink">
                      {formatMoney(totals.total)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  Secured by Paystack — cards, bank transfer & USSD. Your invoice and receipt are
                  emailed automatically.
                </p>
              </div>
            ) : (
              <div className="rounded-card border border-hairline bg-paper p-6">
                <h3 className="font-display text-sm font-bold text-ink">What happens next</h3>
                <p className="mt-2 text-sm leading-relaxed text-body">
                  This service is scoped individually, so there&apos;s nothing to pay today. We&apos;ll
                  review your brief and email you a tailored quote within{" "}
                  <strong>2 business days</strong> — you can accept and pay it right from your
                  dashboard.
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.05] px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {/* Nav buttons */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-hairline px-5 py-2.5 text-sm font-semibold text-body transition-colors hover:bg-surface",
              step === 0 && "invisible"
            )}
          >
            <ArrowLeft className="size-4" /> Back
          </button>

          {mode === "public" && step === 1 ? (
            <button
              type="button"
              onClick={continueToAccount}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
            >
              Continue — create account or sign in <ArrowRight className="size-4" />
            </button>
          ) : step < lastStep ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover keep-brand"
            >
              Continue <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 keep-brand"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Submitting…
                </>
              ) : isFixed ? (
                <>Confirm & pay {totals ? formatMoney(totals.total) : ""}</>
              ) : (
                <>Submit request</>
              )}
            </button>
          )}
        </div>

        {mode === "public" && (
          <p className="mt-4 text-xs text-muted">
            Your progress is saved on this device — after creating your account (a 1-minute email
            verification) you&apos;ll pick up exactly where you left off.
          </p>
        )}
      </div>
    </div>
  );
}
