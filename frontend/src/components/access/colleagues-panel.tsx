"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Button } from "@/components/kit";
import { inputClass } from "@/components/auth/ui";
import { Select } from "@/components/ui/select";
import { inviteColleagueAction } from "@/app/account/colleague-actions";
import { cn } from "@/lib/utils";

const ACCESS = [
  { value: "billing", label: "Billing contact", hint: "Gets invoices and receipts, and can pay." },
  { value: "reviewer", label: "Reviewer", hint: "Can approve drafts and answer asks." },
  { value: "viewer", label: "Can view", hint: "Sees requests, files and invoices." },
] as const;
const LABEL: Record<string, string> = { owner: "Owner", billing: "Billing contact", reviewer: "Reviewer", viewer: "Can view" };

export type Colleague = { id: string; name: string | null; email: string; access: string; you: boolean };

/** Client settings: the people at the business who can use this portal, and an invite. */
export function ColleaguesPanel({ people }: { people: Colleague[] }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<(typeof ACCESS)[number]["value"]>("billing");
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function invite() {
    setError(null);
    start(async () => {
      const r = await inviteColleagueAction({ email, access });
      if (!r.ok) return setError(r.error);
      toast.success(r.message);
      setInvited((xs) => [...xs, email.trim()]);
      setEmail("");
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-hairline rounded-ctl border border-hairline">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {p.name || p.email}
                {p.you ? <span className="ml-1.5 text-[12px] font-normal text-muted">You</span> : null}
              </span>
              <span className="block truncate text-[12.5px] text-muted">{p.email}</span>
            </span>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-medium text-body">{LABEL[p.access] ?? p.access}</span>
          </li>
        ))}
        {invited.map((e) => (
          <li key={e} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0 truncate text-sm text-body">{e}</span>
            <span className="shrink-0 rounded-full bg-info-soft px-2.5 py-0.5 text-[12px] font-medium text-info">Invited</span>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Invite a colleague</p>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="colleague-email-settings">
            Colleague email
          </label>
          <input
            id="colleague-email-settings"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="accounts@yourcompany.com"
            className={cn(inputClass, "min-w-0 flex-[1_1_200px]")}
            aria-invalid={error ? true : undefined}
          />
          <Select aria-label="What they can do" value={access} onChange={(v) => setAccess(v as typeof access)} options={ACCESS.map((a) => ({ value: a.value, label: a.label }))} />
          <Button onClick={invite} disabled={pending || !email} className="h-11">
            <Plus className="size-4" aria-hidden /> Invite
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-[13px] font-medium text-bad">
            {error}
          </p>
        ) : (
          <p className="text-[13px] text-muted">{ACCESS.find((a) => a.value === access)?.hint} The link works once, for 7 days.</p>
        )}
      </div>
    </div>
  );
}
