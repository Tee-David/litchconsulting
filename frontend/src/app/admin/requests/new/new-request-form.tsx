"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/kit";
import { Select } from "@/components/ui/select";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/admin/ui/toaster";
import { adminCreateRequestAction } from "./actions";

export type ClientChoice = { id: string; label: string; hint?: string; hasLogin: boolean };
export type ServiceChoice = { slug: string; label: string; hint: string };

export function NewRequestForm({
  clients,
  services,
  initialClientId,
}: {
  clients: ClientChoice[];
  services: ServiceChoice[];
  initialClientId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [clientId, setClientId] = useState(initialClientId);
  const [serviceSlug, setServiceSlug] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const picked = clients.find((c) => c.id === clientId);
  const noLogin = picked && !picked.hasLogin;
  const ready = Boolean(clientId && serviceSlug && details.trim() && !noLogin);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    start(async () => {
      const res = await adminCreateRequestAction({ clientId, serviceSlug, details });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Request opened.");
      router.push(`/admin/requests/${res.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Client">
        <Select
          aria-label="Client"
          searchable
          value={clientId}
          onChange={setClientId}
          placeholder="Choose a client"
          options={clients.map((c) => ({ value: c.id, label: c.label, hint: c.hint }))}
        />
      </Field>
      {noLogin ? (
        <p className="rounded-lg bg-warn/10 px-3.5 py-3 text-sm text-ink">
          This client has no portal login yet, so they cannot see a request.{" "}
          <Link href={`/admin/clients/${picked.id}`} className="font-medium text-accent hover:underline">
            Invite them from their client page
          </Link>{" "}
          first.
        </p>
      ) : null}
      <Field label="Service">
        <Select
          aria-label="Service"
          searchable={services.length > 5}
          value={serviceSlug}
          onChange={setServiceSlug}
          placeholder="Choose a service"
          options={services.map((s) => ({ value: s.slug, label: s.label, hint: s.hint }))}
        />
      </Field>
      <Field label="Brief" htmlFor="new-request-details" hint="The client sees this.">
        <Textarea
          id="new-request-details"
          rows={5}
          maxLength={5000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What the client needs, the period it covers and any deadline."
        />
      </Field>
      <p className="text-xs text-muted">
        A fixed-price service issues its invoice now; the client pays from their workspace. A quote service waits for
        your quote.
      </p>
      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Open request
        </Button>
      </div>
    </form>
  );
}
