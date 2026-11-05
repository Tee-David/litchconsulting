"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Button } from "@/components/kit";
import { Field } from "@/components/auth/ui";
import { markOnboardingStepAction, saveAlertPrefsAction, updateNameAction } from "@/app/account/actions";
import { cn } from "@/lib/utils";

type Pref = { category: string; label: string; hint: string; mode: "immediate" | "digest" | "off"; email: boolean; push: boolean };

/**
 * Staff welcome (R1.5): three short steps — profile, how you hear from us,
 * two-step sign-in (already done: it is required before the workspace opens) —
 * ending on their first assignments. Every step can be skipped.
 */
export function StaffWelcome({
  firstName,
  name: initialName,
  email,
  twoStep,
  startAt,
  prefs: initialPrefs,
  assigned,
  next,
}: {
  firstName: string;
  name: string;
  email: string;
  twoStep: boolean;
  startAt: number;
  prefs: Pref[];
  assigned: Array<{ id: string; number: string; service: string; client: string | null }>;
  next: string;
}) {
  const toast = useToast();
  const [step, setStep] = useState(startAt);
  const [name, setName] = useState(initialName);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, start] = useTransition();

  const steps = [
    { t: "Your profile", s: "Your name as clients see it" },
    { t: "How you hear from us", s: "Email, push, this bell" },
    { t: "Two-step sign-in", s: "Authenticator app" },
  ];

  function saveProfile() {
    start(async () => {
      if (name.trim() !== initialName) {
        const r = await updateNameAction(name);
        if (!r.ok) return toast.error(r.error);
      }
      await markOnboardingStepAction("profile");
      setStep(1);
    });
  }

  function saveAlerts() {
    start(async () => {
      const r = await saveAlertPrefsAction(prefs.map(({ category, mode, email: e, push }) => ({ category, mode, email: e, push })));
      if (!r.ok) return toast.error(r.error);
      toast.success("Alerts saved.");
      setStep(2);
    });
  }

  const set = (category: string, patch: Partial<Pref>) => setPrefs((ps) => ps.map((p) => (p.category === category ? { ...p, ...patch } : p)));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-card border border-hairline bg-paper p-5 sm:p-7">
        <h1 className="font-display text-[1.5rem] font-bold leading-tight text-ink">Welcome to Litch, {firstName}</h1>
        <p className="mt-1 text-[15px] text-body">Three short steps, then your work is waiting. You can skip and come back from Profile and security.</p>

        <ol className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Steps">
          {steps.map((s, i) => {
            const done = i < step || (i === 2 && twoStep);
            return (
              <li key={s.t}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-ctl border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    i === step ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface",
                  )}
                >
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold", done ? "bg-good text-white" : i === step ? "bg-act text-act-ink" : "bg-surface text-muted")}>
                    {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{s.t}</span>
                    <span className="block text-[12.5px] text-muted">{s.s}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-6">
          {step === 0 ? (
            <div className="space-y-4">
              <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" hint="Shown on what you change and send, and to clients on their requests." />
              <Field label="Email" value={email} readOnly hint="Your sign-in email. Ask an Admin if it needs to change." />
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Skip for now
                </Button>
                <Button variant="primary" onClick={saveProfile} disabled={pending || name.trim().length < 2}>
                  Next: alerts
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead>
                    <tr className="text-left text-[12.5px] text-muted">
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="px-2 py-2 font-medium">Timing</th>
                      <th className="px-2 py-2 text-center font-medium">Email</th>
                      <th className="px-2 py-2 text-center font-medium">Push</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {prefs.map((p) => (
                      <tr key={p.category}>
                        <td className="py-3 pr-3">
                          <span className="block font-medium text-ink">{p.label}</span>
                          <span className="block text-[12.5px] text-muted">{p.hint}</span>
                        </td>
                        <td className="px-2 py-3">
                          <select
                            aria-label={`${p.label}: timing`}
                            value={p.mode}
                            onChange={(e) => set(p.category, { mode: e.target.value as Pref["mode"] })}
                            className="h-9 rounded-ctl border border-line-strong bg-paper px-2 text-sm text-ink"
                          >
                            <option value="immediate">Right away</option>
                            <option value="digest">Daily summary</option>
                            <option value="off">Bell only</option>
                          </select>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <input type="checkbox" aria-label={`${p.label}: email`} checked={p.email} disabled={p.mode !== "immediate"} onChange={(e) => set(p.category, { email: e.target.checked })} className="size-4 accent-[var(--color-act)]" />
                        </td>
                        <td className="px-2 py-3 text-center">
                          <input type="checkbox" aria-label={`${p.label}: push`} checked={p.push} disabled={p.mode !== "immediate"} onChange={(e) => set(p.category, { push: e.target.checked })} className="size-4 accent-[var(--color-act)]" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Skip for now
                </Button>
                <div className="flex gap-2">
                  <Button onClick={() => setStep(0)}>Back</Button>
                  <Button variant="primary" onClick={saveAlerts} disabled={pending}>
                    Save and continue
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-4">
                <ShieldCheck className={cn("mt-0.5 size-5 shrink-0", twoStep ? "text-good" : "text-warn")} aria-hidden />
                <div className="text-sm">
                  <p className="font-medium text-ink">{twoStep ? "Two-step sign-in is on" : "Two-step sign-in is not set up"}</p>
                  <p className="text-body">
                    {twoStep
                      ? "Each new device asks for a code from your authenticator app. Keep your backup codes safe."
                      : "Staff accounts need it before the workspace opens."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href="/account/security" className="inline-flex h-10 items-center rounded-ctl border border-line-strong bg-paper px-3.5 text-sm font-medium text-ink hover:bg-surface">
                  Review security
                </Link>
                <Link href={`${next}${next.includes("?") ? "&" : "?"}tour=1`} className="keep-brand inline-flex h-10 items-center rounded-ctl bg-act px-3.5 text-sm font-semibold text-act-ink hover:bg-act-hover">
                  Go to my work
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
        <p className="text-sm font-medium text-ink">Already assigned to you</p>
        {assigned.length ? (
          <ul className="mt-2 space-y-1.5">
            {assigned.map((a) => (
              <li key={a.id} className="text-[13.5px] text-body">
                <Link href={`/work/requests/${a.id}`} className="font-medium text-accent hover:underline">
                  {a.number}
                </Link>{" "}
                · {a.client ?? "Client"} · {a.service}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-muted">Nothing yet. An Admin assigns requests to you; you get an email and a notice when they do.</p>
        )}
      </div>
    </div>
  );
}
