/**
 * Send one of each transactional template to a test inbox — both a preview of
 * the designs and a live check that SMTP delivery works.
 *
 *   node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/send-email-samples.ts [to]
 *
 * `--conditions=react-server` is required: lib/email.ts imports `server-only`,
 * whose default entry throws outside a server bundle. That flag selects the
 * package's no-op export, exactly as Next's bundler does.
 */
import {
  emailConfigured,
  emailButton,
  emailDetailRows,
  emailLayout,
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";

const to = process.argv[2] || "wedigcreativity@gmail.com";
const base = "https://www.litchconsulting.com";

async function main() {
  if (!emailConfigured) {
    console.error("SMTP not configured — set SMTP_* in .env.local");
    process.exit(1);
  }

  const results: Record<string, boolean> = {};

  results.verification = (
    await sendVerificationEmail(to, `${base}/api/auth/verify-email?token=SAMPLE_TOKEN&callbackURL=/dashboard`)
  ).delivered;

  results.passwordReset = (
    await sendPasswordResetEmail(to, `${base}/reset-password?token=SAMPLE_TOKEN`)
  ).delivered;

  results.welcome = (
    await sendEmail({
      to,
      subject: "Welcome to Litch Consulting",
      html: emailLayout(
        `
        <p style="margin:0 0 6px;font-size:20px;font-weight:700;">You're all set 🎉</p>
        <p class="body" style="margin:0 0 22px;color:#41485a;">Your account is verified — welcome aboard. From your dashboard you can request a service, track progress, pay invoices, download deliverables and reach us any time.</p>
        <p style="margin:0 0 8px;">${emailButton(`${base}/dashboard`, "Open your dashboard")}</p>
      `,
        { preheader: "Your Litch Consulting account is ready." },
      ),
    })
  ).delivered;

  results.receipt = (
    await sendEmail({
      to,
      subject: "Payment received — receipt for LC-INV-0042",
      html: emailLayout(
        `
        <p style="margin:0 0 6px;font-size:20px;font-weight:700;">Payment received ✓</p>
        <p class="body" style="margin:0 0 18px;color:#41485a;">Thank you — we've received your payment for <strong>LC-INV-0042</strong>. Your receipt is below and attached as a PDF.</p>
        ${emailDetailRows([
          { label: "Invoice", value: "LC-INV-0042" },
          { label: "Project", value: "FY2025 Annual Report" },
          { label: "Paid on", value: "17 Jul 2026" },
          { label: "Amount", value: "₦2,074,750.00", strong: true },
        ])}
        <p style="margin:18px 0 8px;">${emailButton(`${base}/dashboard/invoices`, "View in your portal")}</p>
      `,
        { preheader: "Your payment for LC-INV-0042 was received." },
      ),
    })
  ).delivered;

  console.log("delivered:", JSON.stringify(results, null, 2), "→", to);
}

void main();
