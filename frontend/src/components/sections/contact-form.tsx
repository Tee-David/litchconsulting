"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { contactSchema, serviceOptions } from "@/lib/schemas";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15";
const label = "mb-1.5 block text-[13px] font-semibold text-ink";

type Errors = Partial<Record<"name" | "email" | "service" | "message", string>>;

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [err, setErr] = useState<string | null>(null);
  const [service, setService] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      company: String(fd.get("company") || ""),
      service: String(fd.get("service") || ""),
      message: String(fd.get("message") || ""),
    };

    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setErr("Something went wrong. Please try again or email us directly.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-card border border-hairline bg-paper p-10 text-center">
        <CheckCircle2 className="size-10 text-brand" />
        <h3 className="mt-4 font-display text-xl font-bold text-ink">Message sent</h3>
        <p className="mt-2 text-body">Thanks for reaching out; we&rsquo;ll be in touch shortly.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-card border border-hairline bg-paper p-6 shadow-sm shadow-black/5 sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="name">Full name</label>
          <input id="name" name="name" className={field} placeholder="Your name" />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className={field} placeholder="you@company.com" />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </div>
        <div>
          <label className={label} htmlFor="company">Company <span className="text-muted">(optional)</span></label>
          <input id="company" name="company" className={field} placeholder="Company name" />
        </div>
        <div>
          <span className={label}>Service</span>
          {/* Custom Select isn't a form control — the hidden input carries the value into FormData. */}
          <input type="hidden" name="service" value={service} />
          <Select
            value={service}
            onChange={setService}
            options={serviceOptions.map((s) => ({ value: s, label: s }))}
            placeholder="Select a service"
            aria-label="Service"
          />
          {errors.service && <p className="mt-1 text-xs text-red-600">{errors.service}</p>}
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor="message">How can we help?</label>
        <textarea id="message" name="message" rows={5} className={cn(field, "resize-none")} placeholder="Tell us a little about your business and what you need." />
        {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
