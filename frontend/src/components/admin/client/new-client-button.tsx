"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import { useToast } from "@/components/admin/ui/toaster";
import { createClient } from "@/app/admin/clients/actions";

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1 block text-xs font-medium text-body";

const EMPTY = { name: "", company: "", email: "", phone: "", address: "", taxId: "", notes: "" };

export function NewClientButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const router = useRouter();
  const toast = useToast();

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name && !form.company) return toast.error("Enter a name or company.");
    setBusy(true);
    const res = await createClient(form);
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Could not create client.");
    toast.success("Client created.");
    setOpen(false);
    setForm({ ...EMPTY });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        <Plus className="size-4" /> New client
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New client"
        description="Add a client to your directory. You can bill them on invoices right away."
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Save client
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Company</label>
            <input className={inputCls} placeholder="Acme Ltd" value={form.company} onChange={set("company")} />
          </div>
          <div>
            <label className={labelCls}>Contact name</label>
            <input className={inputCls} placeholder="Jane Doe" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} placeholder="jane@acme.com" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} placeholder="+234…" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Address</label>
            <input className={inputCls} placeholder="Street, city, country" value={form.address} onChange={set("address")} />
          </div>
          <div>
            <label className={labelCls}>Tax ID</label>
            <input className={inputCls} placeholder="TIN / RC" value={form.taxId} onChange={set("taxId")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={inputCls} placeholder="Anything useful about this client" value={form.notes} onChange={set("notes")} />
          </div>
        </div>
      </Modal>
    </>
  );
}
