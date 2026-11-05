/**
 * Send a sample of the main email templates (lib/email-templates.ts) to a
 * test inbox — both a preview of the designs and a live check that SMTP
 * delivery works.
 *
 *   node --conditions=react-server --env-file=.env.local \
 *     --import tsx scripts/send-email-samples.ts [to]
 *
 * `--conditions=react-server` is required: lib/email.ts imports `server-only`,
 * whose default entry throws outside a server bundle. That flag selects the
 * package's no-op export, exactly as Next's bundler does.
 */
import { emailConfigured } from "@/lib/email";
import { sendTemplate } from "@/lib/email-templates";

const to = process.argv[2] || "wedigcreativity@gmail.com";
const base = "https://www.litchconsulting.com";

async function main() {
  if (!emailConfigured) {
    console.error("SMTP not configured — set SMTP_* in .env.local");
    process.exit(1);
  }
  const results: Record<string, boolean> = {};
  results.verifyEmail = (await sendTemplate("verifyEmail", { name: "Ada Obi", url: `${base}/api/auth/verify-email?token=SAMPLE_TOKEN` }, { to })).delivered;
  results.passwordReset = (await sendTemplate("passwordReset", { name: "Ada Obi", url: `${base}/reset-password?token=SAMPLE_TOKEN` }, { to })).delivered;
  results.welcome = (await sendTemplate("welcome", { name: "Ada Obi", role: "client", homeUrl: `${base}/dashboard` }, { to })).delivered;
  results.receipt = (
    await sendTemplate(
      "receipt",
      {
        name: "Ada Obi",
        receiptNumber: "LC-INV-0042",
        forWhat: "FY2025 Annual Report",
        rows: [
          { label: "Invoice", value: "LC-INV-0042" },
          { label: "Paid on", value: "17 Jul 2026" },
        ],
        total: "₦2,074,750.00",
        url: `${base}/dashboard/billing`,
      },
      { to },
    )
  ).delivered;
  console.log("delivered:", JSON.stringify(results, null, 2), "→", to);
}

void main();
