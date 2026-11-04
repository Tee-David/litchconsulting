"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, CreditCard, Landmark, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { cn } from "@/lib/utils";
import { startCardPaymentAction, submitTransferProofAction } from "@/app/dashboard/billing/actions";

export type PayOptionView = { id: "deposit" | "full" | "balance"; label: string; amount: string; hint: string };

function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

async function uploadProof(invoiceId: string, file: File, onProgress: (p: number) => void): Promise<string> {
  const res = await fetch("/api/dashboard/payments/proof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId, fileName: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; uploadUrl?: string; key?: string; error?: string };
  if (!res.ok || !body.ok || !body.uploadUrl || !body.key) throw new Error(body.error || "Could not start the upload.");
  try {
    await putWithProgress(body.uploadUrl, file, onProgress);
    return body.key;
  } catch {
    // Direct upload blocked (bucket CORS): relay small files through the server.
    const form = new FormData();
    form.append("file", file);
    form.append("invoiceId", invoiceId);
    const relay = await fetch("/api/dashboard/payments/proof", { method: "POST", body: form });
    const rb = (await relay.json().catch(() => ({}))) as { ok?: boolean; key?: string; error?: string };
    if (!relay.ok || !rb.ok || !rb.key) throw new Error(rb.error || "The upload failed. Try again.");
    onProgress(100);
    return rb.key;
  }
}

/** Card (Paystack) or bank transfer with receipt upload; deposit/full/balance choice. */
export function PayPanel({
  invoiceId,
  invoiceNumber,
  options,
  bank,
  cardAvailable,
}: {
  invoiceId: string;
  invoiceNumber: string;
  options: PayOptionView[];
  bank: { name: string; accountName: string; accountNumber: string } | null;
  cardAvailable: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [method, setMethod] = useState<"card" | "transfer">(cardAvailable ? "card" : "transfer");
  const [option, setOption] = useState(options[0]?.id ?? "full");
  const [busy, setBusy] = useState<null | "card" | number>(null);
  const [err, setErr] = useState<string | null>(null);
  const chosen = options.find((o) => o.id === option) ?? options[0];

  const payCard = async () => {
    setBusy("card");
    setErr(null);
    const r = await startCardPaymentAction(invoiceId, option);
    if (!r.ok) {
      setBusy(null);
      return setErr(r.error);
    }
    window.location.assign(r.url);
  };

  const sendProof = async (file: File) => {
    setErr(null);
    setBusy(0);
    try {
      const key = await uploadProof(invoiceId, file, (p) => setBusy(p));
      const r = await submitTransferProofAction({ invoiceId, option, key, fileName: file.name });
      if (!r.ok) throw new Error(r.error);
      toast.success("Receipt uploaded. We confirm within a working day.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s/g, ""));
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy is blocked in this browser. Select the text instead.");
    }
  };

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Pay with" className="grid grid-cols-2 gap-1 rounded-ctl border border-hairline bg-surface p-1">
        {(
          [
            ["card", "Card or bank app", CreditCard],
            ["transfer", "Bank transfer", Landmark],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={method === id}
            disabled={id === "card" && !cardAvailable}
            onClick={() => setMethod(id)}
            className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-[calc(var(--radius-ctl,0.6rem)-2px)] text-sm font-medium disabled:opacity-50", method === id ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {options.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{method === "card" ? "How much now?" : "How much are you transferring?"}</legend>
          {options.map((o) => (
            <label key={o.id} className={cn("mb-2 flex cursor-pointer gap-3 rounded-ctl border p-3", option === o.id ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface")}>
              <input type="radio" name="amount" checked={option === o.id} onChange={() => setOption(o.id)} className="mt-1 size-4 accent-[var(--color-act)]" />
              <span>
                <b className="block text-sm text-ink">{o.label} · {o.amount}</b>
                {o.hint ? <span className="text-sm text-body">{o.hint}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {method === "card" ? (
        <div className="space-y-3">
          <p className="rounded-ctl bg-surface p-3 text-sm text-body">Paystack opens in a secure page: card, bank transfer, USSD or your bank app. No fee for you.</p>
          <Button variant="primary" className="h-12 w-full" onClick={payCard} disabled={busy !== null}>
            {busy === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy === "card" ? "Opening Paystack…" : `Pay ${chosen?.amount ?? ""} with Paystack`}
          </Button>
          <p className="text-xs text-muted">If you close Paystack midway, nothing is charged twice. We check and email you the result.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bank ? (
            <>
              <p className="text-sm text-body">Transfer to this account, then upload the receipt. We confirm within a working day.</p>
              <dl className="divide-y divide-hairline rounded-ctl bg-surface px-3 text-sm">
                {(
                  [
                    ["Bank", bank.name],
                    ["Account name", bank.accountName],
                    ["Account number", bank.accountNumber],
                    ["Amount", chosen?.amount ?? ""],
                    ["Reference", invoiceNumber],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="flex items-center gap-1 font-semibold tabular-nums text-ink">
                      {v}
                      {k !== "Bank" ? (
                        <button type="button" onClick={() => copy(k, v)} aria-label={`Copy ${k}`} className="grid size-7 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink">
                          <Copy className="size-3.5" />
                        </button>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-sm text-warn">Our bank details are not set up yet. Pay by card, or ask Support for the account.</p>
          )}
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Upload your transfer receipt</p>
            <input id="proof" type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && sendProof(e.target.files[0])} disabled={busy !== null} />
            <label
              htmlFor="proof"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-ctl border border-dashed border-line-strong bg-surface px-4 py-4 text-sm hover:border-accent focus-within:ring-2 focus-within:ring-accent/40",
                busy !== null && "pointer-events-none opacity-70",
              )}
            >
              {typeof busy === "number" ? <Loader2 className="size-5 animate-spin text-muted" aria-hidden /> : <Upload className="size-5 text-muted" aria-hidden />}
              <span>
                <b className="block text-ink">{typeof busy === "number" ? `Uploading… ${busy}%` : "Choose a file or take a photo"}</b>
                <span className="text-muted">PDF, PNG or JPG, up to 10 MB</span>
              </span>
            </label>
          </div>
          <p className="rounded-ctl bg-info-soft p-3 text-sm text-info">Deducting WHT? Pay the net amount and send us the WHT credit note through Support.</p>
        </div>
      )}
      {err ? <p role="alert" className="text-sm text-bad">{err}</p> : null}
    </div>
  );
}
