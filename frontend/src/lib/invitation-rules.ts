/**
 * Which pending invitations a new one replaces (pure; unit-tested).
 *
 * - A firm invitation (staff or admin: only Admin can send these) replaces
 *   every pending invitation for that address.
 * - A client colleague invitation never touches a pending firm invitation: it
 *   is refused instead, so a client cannot withdraw Litch's invite by inviting
 *   the same address. It replaces only earlier pending invitations from the
 *   SAME client company; another company's pending invite is left alone (one
 *   client must never be able to cancel another's).
 */

export type PendingInvite = { id: string; role: string; clientId: string | null };
export type NewInvite = { role: "admin" | "staff" | "client"; clientId?: string | null };

export type SupersedePlan = { ok: true; revokeIds: string[] } | { ok: false; error: string };

export const FIRM_PENDING_ERROR = "This person already has a pending invitation from Litch.";

const isFirm = (role: string) => role === "admin" || role === "staff";

export function supersedePlan(next: NewInvite, pending: PendingInvite[]): SupersedePlan {
  if (isFirm(next.role)) return { ok: true, revokeIds: pending.map((p) => p.id) };
  if (pending.some((p) => isFirm(p.role))) return { ok: false, error: FIRM_PENDING_ERROR };
  return { ok: true, revokeIds: pending.filter((p) => p.role === "client" && p.clientId != null && p.clientId === next.clientId).map((p) => p.id) };
}
