"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Video,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CalendarDays,
  Globe,
} from "lucide-react";
import { serviceOptions } from "@/lib/schemas";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatLong(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type Step = 0 | 1 | 2 | 3;

export function BookingForm() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [step, setStep] = useState<Step>(0);
  const [service, setService] = useState(serviceOptions[0]);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [details, setDetails] = useState({ name: "", email: "", note: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  // Build the calendar grid (Mon-first).
  const grid = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7; // Mon=0
    const cells: (Date | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.year, view.month, d));
    return cells;
  }, [view]);

  const isSelectable = (d: Date) => {
    const day = d.getDay();
    return d >= today && day !== 0 && day !== 6;
  };

  const changeMonth = (dir: 1 | -1) => {
    setView((v) => {
      const m = v.month + dir;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  const monthLabel = new Date(view.year, view.month).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const canConfirm = details.name.trim().length > 1 && /\S+@\S+\.\S+/.test(details.email);

  const submit = async () => {
    if (!date || !time || !canConfirm) return;
    setStatus("sending");
    const message = `Consultation booking\nService: ${service}\nDate: ${formatLong(date)}\nTime: ${time} (WAT)\nFormat: Google Meet / phone\n\nNote: ${details.note || "—"}`;
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: details.name,
          email: details.email,
          service,
          message,
        }),
      });
      if (!res.ok) throw new Error();
      setStep(3);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const stepsMeta = ["Date", "Time", "Details", "Done"];

  return (
    <div className="grid overflow-hidden rounded-hero border border-hairline bg-paper lg:grid-cols-[0.85fr_1.15fr]">
      {/* Summary panel */}
      <div className="relative flex flex-col justify-between gap-6 bg-brand p-7 text-white md:p-9">
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-highlight/25 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-highlight">
            Litch Consulting
          </p>
          <h3 className="mt-3 font-display text-2xl font-bold leading-tight">
            Book your free consultation
          </h3>
          <p className="mt-3 text-sm text-white/70">
            A focused discovery call to understand your goals and map how we can help across
            reporting, modelling, tax and advisory.
          </p>
        </div>

        <ul className="relative flex flex-col gap-3 text-sm">
          <li className="flex items-center gap-3">
            <Clock className="size-4 text-highlight" /> 30 minutes
          </li>
          <li className="flex items-center gap-3">
            <Video className="size-4 text-highlight" /> Google Meet or phone
          </li>
          <li className="flex items-center gap-3">
            <CheckCircle2 className="size-4 text-highlight" /> No obligation, no cost
          </li>
          <li className="flex items-center gap-3">
            <Globe className="size-4 text-highlight" /> West Africa Time (WAT)
          </li>
          {date && (
            <li className="flex items-center gap-3">
              <CalendarDays className="size-4 text-highlight" />
              {formatLong(date)}
              {time ? `, ${time} WAT` : ""}
            </li>
          )}
        </ul>

        <div className="relative rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm">
          <span className="text-white/60">Service</span>
          <p className="font-medium">{service}</p>
        </div>
      </div>

      {/* Step panel */}
      <div className="flex min-h-[440px] flex-col p-6 md:p-9">
        {/* Progress */}
        {step < 3 && (
          <div className="mb-6 flex items-center gap-2">
            {stepsMeta.slice(0, 3).map((label, i) => (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[11px] font-bold transition-colors",
                    i <= step ? "bg-brand text-white" : "bg-surface text-muted"
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn("text-xs font-medium", i <= step ? "text-ink" : "text-muted")}>
                  {label}
                </span>
                {i < 2 && <span className="h-px flex-1 bg-hairline" />}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 0 — service + date */}
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col"
            >
              <span className="text-sm font-medium text-ink">What would you like to discuss?</span>
              <Select
                className="mt-2"
                value={service}
                onChange={setService}
                options={serviceOptions.map((s) => ({ value: s, label: s }))}
                aria-label="What would you like to discuss?"
              />


              <div className="mt-6 flex items-center justify-between">
                <p className="font-display text-base font-bold text-ink">{monthLabel}</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => changeMonth(-1)}
                    aria-label="Previous month"
                    className="grid size-8 place-items-center rounded-full border border-hairline hover:border-brand hover:text-brand"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    onClick={() => changeMonth(1)}
                    aria-label="Next month"
                    className="grid size-8 place-items-center rounded-full border border-hairline hover:border-brand hover:text-brand"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                    {w}
                  </span>
                ))}
                {grid.map((d, i) => {
                  if (!d) return <span key={`e${i}`} />;
                  const selectable = isSelectable(d);
                  const selected = date && d.getTime() === date.getTime();
                  return (
                    <button
                      key={d.toISOString()}
                      disabled={!selectable}
                      onClick={() => {
                        setDate(d);
                        setStep(1);
                      }}
                      className={cn(
                        "aspect-square rounded-lg text-sm font-medium transition-colors",
                        selected
                          ? "bg-brand text-white"
                          : selectable
                            ? "bg-brand-tint text-brand hover:bg-brand hover:text-white"
                            : "cursor-not-allowed text-muted/40"
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 1 — time */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col"
            >
              <p className="text-sm font-medium text-ink">
                Select a time <span className="text-muted">· {date && formatLong(date)}</span>
              </p>
              <div className="mt-4 grid max-h-[280px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setTime(slot)}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-medium transition-colors",
                      time === slot
                        ? "border-brand bg-brand text-white"
                        : "border-hairline hover:border-brand hover:text-brand"
                    )}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-6">
                <button onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  disabled={!time}
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  Next <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2 — details */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="flex flex-1 flex-col gap-3"
            >
              <div>
                <label className="text-sm font-medium text-ink">Full name *</label>
                <input
                  value={details.name}
                  onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-hairline px-4 py-2.5 text-sm outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink">Email *</label>
                <input
                  type="email"
                  value={details.email}
                  onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-hairline px-4 py-2.5 text-sm outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink">
                  Anything we should know? <span className="text-muted">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={details.note}
                  onChange={(e) => setDetails((d) => ({ ...d, note: e.target.value }))}
                  className="mt-1.5 w-full resize-none rounded-xl border border-hairline px-4 py-2.5 text-sm outline-none focus:border-brand"
                />
              </div>
              {status === "error" && (
                <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
              )}
              <div className="mt-auto flex items-center justify-between pt-4">
                <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button
                  disabled={!canConfirm || status === "sending"}
                  onClick={submit}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                  {status === "sending" && <Loader2 className="size-4 animate-spin" />}
                  Confirm booking <ArrowRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3 — confirmed */}
          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <CheckCircle2 className="size-14 text-brand" />
              <h3 className="mt-4 font-display text-2xl font-bold text-ink">Booking confirmed!</h3>
              <p className="mt-2 max-w-sm text-sm text-body">
                We&rsquo;ve received your request. A member of the Litch team will confirm your
                consultation by email shortly.
              </p>
              <div className="mt-6 w-full max-w-sm rounded-card border border-hairline bg-surface p-5 text-left text-sm">
                <p className="font-display font-bold text-ink">{service}</p>
                <div className="mt-3 flex items-center gap-2 text-body">
                  <CalendarDays className="size-4 text-brand" />
                  {date && formatLong(date)}, {time} WAT
                </div>
                <div className="mt-2 flex items-center gap-2 text-body">
                  <Video className="size-4 text-brand" /> Google Meet / phone
                </div>
              </div>
              <button
                onClick={() => {
                  setStep(0);
                  setDate(null);
                  setTime(null);
                  setDetails({ name: "", email: "", note: "" });
                }}
                className="mt-6 text-sm font-medium text-brand hover:underline"
              >
                Book another consultation
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
