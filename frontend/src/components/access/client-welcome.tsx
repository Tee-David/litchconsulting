"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Button } from "@/components/kit";
import { Field, inputClass } from "@/components/auth/ui";
import { saveCompanyDetailsAction, markOnboardingStepAction } from "@/app/account/actions";
import { inviteColleagueAction } from "@/app/account/colleague-actions";
import { cn } from "@/lib/utils";

const ACCESS = [
  { value: "billing", label: "Billing contact", hint: "Gets invoices and receipts, and can pay." },
  { value: "reviewer", label: "Reviewer", hint: "Can approve drafts and answer asks." },
  { value: "viewer", label: "Can view", hint: "Sees requests, files and invoices." },
] as const;

/**
 * Client welcome (R1.5): the two details that go on every quote and invoice
 * (so their accounts team can file them without asking), plus an optional
 * colleague invite. Nothing blocks; "Do this later" goes straight on.
 */
export function ClientWelcome({
  firstName,
  initial,
  isOwner,
  next,
}: {
  firstName: string;
  initial: { company: string; rcNumber: string; taxId: string; address: string };
  isOwner: boolean;
  next: string;
}) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<(typeof ACCESS)[number]["value"]>("billing");
  const [invited, setInvited] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    start(async () => {
      const r = await saveCompanyDetailsAction(form);
      if (!r.ok) return toast.error(r.error);
      toast.success(r.message ?? "Saved.");
      window.location.href = next;
    });
  }

  function later() {
    start(async () => {
      await markOnboardingStepAction("welcomed");
      window.location.href = next;
    });
  }

  function invite() {
    setInviteError(null);
    start(async () => {
      const r = await inviteColleagueAction({ email, access });
      if (!r.ok) return setInviteError(r.error);
      toast.success(r.message);
      setInvited((xs) => [...xs, email.trim()]);
      setEmail("");
    });
  }

  return (
    <div className="mx-auto max-w-3xl rounded-card border border-hairline bg-paper p-5 sm:p-7">
      <h1 className="font-display text-[1.5rem] font-bold leading-tight text-ink">Welcome, {firstName}. Two quick details</h1>
      <p className="mt-1 text-[15px] text-body">We put these on your quotes and invoices, so your accounts team can file them without asking.</p>

      {isOwner ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Company name" value={form.company} onChange={set("company")} autoComplete="organization" />
          </div>
          <Field label="RC number" value={form.rcNumber} onChange={set("rcNumber")} placeholder="RC 1187420" className="tabular-nums" />
          <Field label="TIN" value={form.taxId} onChange={set("taxId")} placeholder="20184432-0001" hint="Needed for WHT credit notes" className="tabular-nums" />
          <div className="sm:col-span-2">
            <Field label="Billing address" value={form.address} onChange={set("address")} autoComplete="street-address" />
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-card bg-surface p-4 text-sm text-body">Your company&apos;s details are kept by the person who invited you. You can still invite a colleague below.</p>
      )}

      <div className="mt-6 space-y-2 border-t border-hairline pt-5">
        <p className="text-sm font-medium text-ink">Who else at your business should have access?</p>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="colleague-email">
            Colleague email
          </label>
          <input
            id="colleague-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="accounts@yourcompany.com"
            className={cn(inputClass, "min-w-0 flex-[1_1_220px]")}
            aria-invalid={inviteError ? true : undefined}
          />
          <label className="sr-only" htmlFor="colleague-access">
            Their access
          </label>
          <select
            id="colleague-access"
            value={access}
            onChange={(e) => setAccess(e.target.value as typeof access)}
            className="h-11 rounded-ctl border border-line-strong bg-paper px-3 text-sm text-ink"
          >
            {ACCESS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <Button onClick={invite} disabled={pending || !email} className="h-11">
            <Plus className="size-4" aria-hidden /> Invite
          </Button>
        </div>
        {inviteError ? (
          <p role="alert" className="text-[13px] font-medium text-bad">
            {inviteError}
          </p>
        ) : (
          <p className="text-[13px] text-muted">{ACCESS.find((a) => a.value === access)?.hint} The link works once, for 7 days.</p>
        )}
        {invited.length ? <p className="text-[13px] text-good">Invited: {invited.join(", ")}</p> : null}
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={later} disabled={pending}>
          Do this later
        </Button>
        {isOwner ? (
          <Button variant="primary" onClick={save} disabled={pending}>
            Save and continue
          </Button>
        ) : (
          <Button variant="primary" onClick={later} disabled={pending}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
