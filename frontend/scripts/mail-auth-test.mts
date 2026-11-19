/**
 * Sends ONE test message through the app's SMTP settings to Port25's public
 * authentication checker (check-auth@verifier.port25.com). The checker replies to
 * the sender with the SPF, DKIM and DMARC results. Prints timings only.
 *
 *   node --env-file=.env.local --import tsx scripts/mail-auth-test.mts
 */
import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT || 465);
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 15_000, greetingTimeout: 30_000, socketTimeout: 45_000,
});
const from = process.env.SMTP_FROM || process.env.SMTP_USER;
const t0 = Date.now();
await t.verify();
const t1 = Date.now();
const info = await t.sendMail({
  from, to: "check-auth@verifier.port25.com",
  subject: `Litch deliverability check ${new Date().toISOString().slice(0, 16)}`,
  text: "Deliverability check from the Litch Consulting platform. Please report SPF, DKIM and DMARC.",
});
console.log(`connect+auth ${t1 - t0} ms, send ${Date.now() - t1} ms, accepted ${info.accepted.length}, ` +
  `server reply: ${String(info.response).slice(0, 80)}`);
