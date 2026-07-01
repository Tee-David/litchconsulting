"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Phone, Mail, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { Eyebrow } from "@/components/ui/primitives";
import { contactSchema, serviceOptions, type ContactInput } from "@/lib/schemas";
import { site, cta } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Contact() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const onSubmit = async (data: ContactInput) => {
    const parsed = contactSchema.safeParse(data);
    if (!parsed.success) {
      setStatus("error");
      return;
    }
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  };

  const field =
    "w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";

  return (
    <section id="contact" className="px-3 py-20 md:px-4 md:py-28">
      <div className="mx-auto grid max-w-[1400px] gap-6 lg:grid-cols-2">
        {/* Left — CTA + contact details */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-hero bg-brand p-8 text-white md:p-12">
          <div className="absolute -right-16 -top-16 size-72 rounded-full bg-highlight/30 blur-3xl" />
          <div className="relative">
            <Eyebrow tone="dark">Get started</Eyebrow>
            <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              {cta.title}
            </h2>
            <p className="mt-4 max-w-md text-white/75">{cta.body}</p>
          </div>

          <ul className="relative mt-10 flex flex-col gap-4">
            <li>
              <a href={`tel:${site.phoneHref}`} className="flex items-center gap-3 text-white/90 hover:text-white">
                <span className="grid size-10 place-items-center rounded-full bg-white/10">
                  <Phone className="size-4" />
                </span>
                {site.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${site.email}`} className="flex items-center gap-3 text-white/90 hover:text-white">
                <span className="grid size-10 place-items-center rounded-full bg-white/10">
                  <Mail className="size-4" />
                </span>
                {site.email}
              </a>
            </li>
            <li className="flex items-center gap-3 text-white/90">
              <span className="grid size-10 place-items-center rounded-full bg-white/10">
                <MapPin className="size-4" />
              </span>
              {site.location}
            </li>
          </ul>
        </div>

        {/* Right — form */}
        <div className="rounded-hero border border-hairline bg-white p-8 md:p-12">
          {status === "success" ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
              <CheckCircle2 className="size-14 text-brand" />
              <h3 className="mt-4 font-display text-2xl font-bold text-ink">Thank you!</h3>
              <p className="mt-2 max-w-sm text-body">
                Your request has been received. A member of the Litch team will be in touch within one business day.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-6 text-sm font-medium text-brand hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <h3 className="font-display text-xl font-bold text-ink">Book a consultation</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <input
                    {...register("name")}
                    placeholder="Full name"
                    className={cn(field, errors.name && "border-red-400")}
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>
                <div>
                  <input
                    {...register("email")}
                    placeholder="Email address"
                    type="email"
                    className={cn(field, errors.email && "border-red-400")}
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                </div>
              </div>

              <input {...register("company")} placeholder="Company (optional)" className={field} />

              <div>
                <select
                  {...register("service")}
                  defaultValue=""
                  className={cn(field, errors.service && "border-red-400")}
                >
                  <option value="" disabled>
                    Service of interest
                  </option>
                  {serviceOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {errors.service && <p className="mt-1 text-xs text-red-500">{errors.service.message}</p>}
              </div>

              <div>
                <textarea
                  {...register("message")}
                  placeholder="How can we help?"
                  rows={4}
                  className={cn(field, "resize-none", errors.message && "border-red-400")}
                />
                {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message.message}</p>}
              </div>

              {status === "error" && (
                <p className="text-sm text-red-500">
                  Something went wrong. Please try again or email us directly.
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {isSubmitting ? "Sending…" : "Request consultation"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
