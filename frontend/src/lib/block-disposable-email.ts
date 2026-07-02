/**
 * Small blocklist of common disposable/temporary email domains, used to keep
 * signups clean. Not exhaustive — just the high-volume throwaway providers.
 */
const BLOCKED: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "yopmail.com", "fakeinbox.com", "trashmail.com",
  "getnada.com", "sharklasers.com", "throwawaymail.com", "maildrop.cc",
  "dispostable.com", "mailnesia.com", "mintemail.com", "mailcatch.com",
  "spamgourmet.com", "mohmal.com", "emailondeck.com", "tempmailo.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return BLOCKED.has(domain);
}
