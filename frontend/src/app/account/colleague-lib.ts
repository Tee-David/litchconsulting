import "server-only";
export { createInvitation, InvitationError, sendInvitationEmail } from "@/lib/invitations";

export async function markStepSafe(userId: string, step: string) {
  try {
    const { markStep } = await import("@/lib/onboarding");
    await markStep(userId, step);
  } catch {
    /* onboarding is best-effort */
  }
}
