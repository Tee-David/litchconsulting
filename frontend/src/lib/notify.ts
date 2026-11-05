import "server-only";

/**
 * Single seam for "tell the admin something happened": email (rendered by the
 * `notice` template in lib/email-templates.ts, so every line is escaped) and
 * web push to admins. `lines` are plain text; use **bold** for emphasis.
 */
export async function notifyAdmin(opts: { subject: string; lines: string[]; href?: string }) {
  const to = process.env.CONTACT_TO_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (to) {
    const { sendTemplate } = await import("@/lib/email-templates");
    await sendTemplate(
      "notice",
      {
        subject: opts.subject,
        heading: opts.subject,
        paragraphs: opts.lines,
        cta: opts.href ? { label: "Open in dashboard", href: opts.href } : null,
        why: "You got this because you are an Admin at Litch Consulting.",
      },
      { to, audience: "admin" },
    ).catch(() => {});
  }
  try {
    const { pushAdmins } = await import("@/lib/push");
    await pushAdmins({ title: opts.subject, url: opts.href });
  } catch {
    // push not configured/built yet — email is the guaranteed channel
  }
}
