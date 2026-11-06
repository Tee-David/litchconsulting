"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button, Sheet } from "@/components/kit";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/admin/ui/toaster";
import { COLLEAGUE_ACCESS } from "@/lib/invitations-shared";
import { inviteClientContactAction } from "../actions";

/** "Invite a contact": a colleague of the client joins the portal with an access level. */
export function InviteContactButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const r = await inviteClientContactAction({ clientId, email, access });
    setBusy(false);
    if (!r.ok) return setError(r.error || "The invitation was not sent.");
    toast.success(`Invitation sent to ${email}.`);
    setOpen(false);
    setEmail("");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="w-full">
        <Plus className="size-4" /> Invite a contact
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        title="Invite a contact"
        description={`They join ${clientName}'s portal. The link in the email works for 7 days.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={send} disabled={busy || !email.trim()}>
              {busy && <Loader2 className="size-4 animate-spin" />} Send invitation
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="contact-email" className="mb-1 block text-xs font-medium text-body">Email</label>
            <input
              id="contact-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="h-10 w-full rounded-ctl border border-hairline bg-paper px-3 text-sm text-ink outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-body">What they can do</span>
            <Select
              value={access}
              onChange={setAccess}
              options={Object.entries(COLLEAGUE_ACCESS).map(([k, v]) => ({ value: k, label: `${v.label} · ${v.hint}` }))}
              aria-label="What they can do"
            />
          </div>
          {error && <p role="alert" className="rounded-ctl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>
      </Sheet>
    </>
  );
}
