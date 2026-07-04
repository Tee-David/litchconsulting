"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Save, Upload, Building2, Landmark, ReceiptText, ImageIcon, Trash2 } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { CURRENCIES } from "@/lib/invoice/money";
import { saveOrgSettingsAction, type OrgSettingsInput } from "@/app/admin/settings/actions";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-body";

type Placeholders = {
  companyName: string;
  email: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  terms: string;
};

function Section({ icon: Icon, title, description, children }: { icon: typeof Building2; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-hairline bg-paper p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
          <Icon className="size-4.5" />
        </span>
        <div>
          <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-body">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function SettingsView({ initial, placeholders }: { initial: OrgSettingsInput; placeholders: Placeholders }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<OrgSettingsInput>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof OrgSettingsInput>(k: K, v: OrgSettingsInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onLogo(file: File) {
    setUploading(true);
    try {
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "logo", contentType: file.type, size: file.size }),
      });
      const data = await presign.json();
      if (!presign.ok) {
        toast.error(data.error || "Upload failed.");
        return;
      }
      const put = await fetch(data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) {
        toast.error("Upload failed.");
        return;
      }
      set("logoUrl", data.publicUrl);
      toast.success("Logo uploaded — click Save to apply.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    const res = await saveOrgSettingsAction(form);
    setSaving(false);
    if (res.ok) {
      toast.success("Settings saved.");
      router.refresh();
    } else toast.error(res.error || "Could not save.");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Organisation profile */}
        <Section icon={Building2} title="Organisation profile" description="Appears on invoices, quotes and receipts.">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Company name</label>
              <input value={form.companyName || ""} onChange={(e) => set("companyName", e.target.value)} placeholder={placeholders.companyName} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Invoice “from” email</label>
              <input type="email" value={form.invoiceFromEmail || ""} onChange={(e) => set("invoiceFromEmail", e.target.value)} placeholder={placeholders.email} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Default currency</label>
              <select value={form.defaultCurrency || "NGN"} onChange={(e) => set("defaultCurrency", e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* Branding */}
        <Section icon={ImageIcon} title="Branding" description="Your logo shows on the document header and header bar.">
          <div className="flex items-center gap-4">
            <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline bg-surface">
              {form.logoUrl ? (
                <Image src={form.logoUrl} alt="Logo" fill sizes="96px" className="object-contain p-2" unoptimized />
              ) : (
                <ImageIcon className="size-7 text-muted" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLogo(f);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload logo
                </button>
                {form.logoUrl && (
                  <button type="button" onClick={() => set("logoUrl", "")} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" /> Remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">PNG, JPG or WebP · square works best · up to 25MB.</p>
            </div>
          </div>
        </Section>

        {/* Bank / payment details */}
        <Section icon={Landmark} title="Payment details" description="The bank account shown on invoices for transfers.">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Bank name</label>
              <input value={form.bankName || ""} onChange={(e) => set("bankName", e.target.value)} placeholder={placeholders.bankName} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Account name</label>
                <input value={form.accountName || ""} onChange={(e) => set("accountName", e.target.value)} placeholder={placeholders.accountName} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Account number</label>
                <input value={form.accountNumber || ""} onChange={(e) => set("accountNumber", e.target.value)} placeholder={placeholders.accountNumber} className={cn(inputCls, "tabular-nums")} />
              </div>
            </div>
          </div>
        </Section>

        {/* Invoice defaults */}
        <Section icon={ReceiptText} title="Invoice defaults" description="Default payment terms added to new invoices.">
          <div>
            <label className={labelCls}>Default terms</label>
            <textarea value={form.invoiceTerms || ""} onChange={(e) => set("invoiceTerms", e.target.value)} rows={4} placeholder={placeholders.terms} className={cn(inputCls, "resize-y")} />
          </div>
        </Section>
      </div>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
        </button>
      </div>
    </div>
  );
}
