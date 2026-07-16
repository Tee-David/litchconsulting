import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Enter a valid email"),
  company: z.string().optional(),
  service: z.string().min(1, "Select a service"),
  message: z.string().min(10, "Tell us a little more (10+ characters)"),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const newsletterSchema = z.object({
  email: z.string().email("Enter a valid email"),
});
export type NewsletterInput = z.infer<typeof newsletterSchema>;

import { services } from "@/lib/content";

/** Derived from the service catalog (lib/content.ts) — never hand-maintain. */
export const serviceOptions: string[] = services.map((s) => s.name);
