"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { updateClientSettingsAction, updateDigestPreferenceAction } from "./actions";
import { cn } from "@/lib/utils";

type SettingsFormProps = {
  initialData: {
    name: string | null;
    company: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    email: string;
    digestOptOut: boolean;
  };
};

export function SettingsForm({ initialData }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState(initialData.name || "");
  const [company, setCompany] = useState(initialData.company || "");
  const [phone, setPhone] = useState(initialData.phone || "");
  const [taxId, setTaxId] = useState(initialData.taxId || "");
  const [address, setAddress] = useState(initialData.address || "");

  // Email preferences (weekly digest opt-out — saves immediately on toggle).
  const [digestOptOut, setDigestOptOut] = useState(initialData.digestOptOut);
  const [digestPending, startDigestTransition] = useTransition();

  const toggleDigest = (nextEnabled: boolean) => {
    const optOut = !nextEnabled;
    setDigestOptOut(optOut);
    startDigestTransition(async () => {
      const res = await updateDigestPreferenceAction(optOut);
      if (!res.ok) setDigestOptOut(!optOut); // revert on failure
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);

    startTransition(async () => {
      const res = await updateClientSettingsAction({
        name,
        company,
        phone,
        address,
        taxId,
      });

      if (res.ok) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(res.error || "Failed to update profile settings.");
      }
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
    <div className="rounded-card border border-hairline bg-paper overflow-hidden">
      <div className="border-b border-hairline px-6 py-4">
        <h3 className="font-display text-sm font-bold text-ink">Business & Profile Information</h3>
        <p className="text-xs text-muted mt-1">
          Keep your billing details and primary contact info accurate to ensure correct invoice issuance.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {success && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-5 shrink-0" />
            <span>Profile and billing settings updated successfully!</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-600 dark:text-red-400">
            <AlertCircle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Read only email */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            Registered Login Email (Read Only)
          </label>
          <input
            type="email"
            value={initialData.email}
            disabled
            className="w-full rounded-xl border border-hairline bg-surface px-3.5 py-2.5 text-sm text-muted cursor-not-allowed"
          />
          <p className="text-[10px] text-muted mt-1">
            Your login identity is managed by the authentication system and cannot be changed from here.
          </p>
        </div>

        {/* Primary Contact Name */}
        <div>
          <label htmlFor="name" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            Primary Contact Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="e.g. David Tee"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Company Name */}
          <div>
            <label htmlFor="company" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              Registered Company / Brand
            </label>
            <input
              id="company"
              type="text"
              placeholder="e.g. Litch Consulting Ltd"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>

          {/* Tax ID */}
          <div>
            <label htmlFor="taxId" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              Tax ID / RC Number
            </label>
            <input
              id="taxId"
              type="text"
              placeholder="e.g. RC-1234567"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {/* Phone Number */}
        <div>
          <label htmlFor="phone" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            placeholder="e.g. +234 803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </div>

        {/* Billing Address */}
        <div>
          <label htmlFor="address" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            Official Billing Address
          </label>
          <textarea
            id="address"
            rows={4}
            placeholder="Provide your physical/corporate billing address for invoices..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={isPending}
            className="w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-end border-t border-hairline pt-4">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </div>

    {/* Email preferences */}
    <div className="rounded-card border border-hairline bg-paper overflow-hidden">
      <div className="border-b border-hairline px-6 py-4">
        <h3 className="font-display text-sm font-bold text-ink flex items-center gap-2">
          <Mail className="size-4 text-brand" />
          Email preferences
        </h3>
        <p className="text-xs text-muted mt-1">
          Control the summary emails we send you.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Weekly summary</p>
          <p className="mt-0.5 text-xs text-muted">
            A short recap of your active requests, amounts due, and deliverables ready to review.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!digestOptOut}
          aria-label="Weekly summary email"
          disabled={digestPending}
          onClick={() => toggleDigest(digestOptOut)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            !digestOptOut ? "bg-brand" : "bg-hairline",
          )}
        >
          <span
            className={cn(
              "inline-block size-4 transform rounded-full bg-white transition-transform",
              !digestOptOut ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
    </div>
    </div>
  );
}
