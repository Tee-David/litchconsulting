import "server-only";
import { templateEmail } from "@/lib/email-templates";

/**
 * Small emails the admin dashboard sends (reminders, asks, review nudges),
 * rendered by the `notice` template in lib/email-templates.ts. Paragraphs are
 * PLAIN TEXT (escaped on render); use **bold** for emphasis, never HTML.
 */
export function simpleEmail(opts: {
  heading: string;
  greeting?: string | null;
  paragraphs: string[];
  rows?: { label: string; value: string; strong?: boolean }[];
  cta?: { href: string; label: string };
  why: string;
  preheader?: string;
}): string {
  return templateEmail("notice", {
    subject: opts.heading,
    heading: opts.heading,
    name: opts.greeting,
    paragraphs: opts.paragraphs,
    rows: opts.rows,
    cta: opts.cta ? { label: opts.cta.label, href: opts.cta.href } : null,
    why: opts.why,
    preheader: opts.preheader,
  }).html;
}
