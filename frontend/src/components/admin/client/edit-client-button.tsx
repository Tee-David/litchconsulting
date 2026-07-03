"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Loader2, Trash2 } from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import { useToast } from "@/components/admin/ui/toaster";
import { updateClient, deleteClient } from "@/app/admin/clients/actions";
import type { ClientRow } from "@/lib/db/queries/clients";

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1 block text-xs font-medium text-body";

export function EditClientButton({ client }: { client: ClientRow }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: client.name ?? "",
    company: client.company ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    taxId: client.taxId ?? "",
    notes: client.notes ?? "",
  });
  const router = useRouter();
  const toast = useToast();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name && !form.company) return toast.error("Enter a name or company.");
    setBusy(true);
    const res = await updateClient(client.id, form);
    setBusy(false);
    if (!res.ok) return toast.error(res.error || "Could not update client.");
    toast.success("Client updated.");
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete ${client.company || client.name}? This can't be undone.`)) return;
    const res = await deleteClient(client.id);
    if (!res.ok) return toast.error(res.error || "Could not delete.");
    toast.success("Client deleted.");
    router.push("/admin/clients");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
      >
        <PenLine className="size-4" /> Edit
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit client"
        footer={
          <>
            <button type="button" onClick={remove} className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10">
              <Trash2 className="size-4" /> Delete
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-surface">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />} Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Company</label>
            <input className={inputCls} value={form.company} onChange={set("company")} />
          </div>
          <div>
            <label className={labelCls}>Contact name</label>
            <input className={inputCls} value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.phone} onChange={set("phone")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Address</label>
            <input className={inputCls} value={form.address} onChange={set("address")} />
          </div>
          <div>
            <label className={labelCls}>Tax ID</label>
            <input className={inputCls} value={form.taxId} onChange={set("taxId")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={inputCls} value={form.notes} onChange={set("notes")} />
          </div>
        </div>
      </Modal>
    </>
  );
}
