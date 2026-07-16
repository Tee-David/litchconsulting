import "server-only";

/**
 * Single seam for "tell the admin something happened": email now, and web
 * push once a subscription exists (added with the admin alerts milestone —
 * this function is the only place that needs to grow).
 */
export async function notifyAdmin(opts: { subject: string; html: string; href?: string }) {
  const { sendEmail, emailLayout } = await import("@/lib/email");
  const to =
    process.env.CONTACT_TO_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (to) {
    await sendEmail({
      to,
      subject: opts.subject,
      html: emailLayout(
        opts.html +
          (opts.href
            ? `<p style="margin:18px 0 0;"><a href="${opts.href}" style="color:#2540c4;">Open in dashboard →</a></p>`
            : "")
      ),
    }).catch(() => {});
  }
  try {
    const { pushAdmins } = await import("@/lib/push");
    await pushAdmins({ title: opts.subject, url: opts.href });
  } catch {
    // push not configured/built yet — email is the guaranteed channel
  }
}
