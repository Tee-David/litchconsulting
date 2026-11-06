/**
 * Plain words for the AI engine, shared by Sage and the workbench.
 * Users see what kind of model answered and what to do when it fails;
 * provider brand names stay in the engine sheet for admins who look.
 */

export const ENGINE_LABEL = {
  cloud: "Fast cloud, masked",
  local: "Private local model, slower",
} as const;

export function engineLabel(kind: string | null | undefined): string {
  return kind === "local" ? ENGINE_LABEL.local : ENGINE_LABEL.cloud;
}

export type FailureKind = "quota" | "timeout" | "unavailable" | "invalid" | "unreadable" | "stopped" | "dropped";

export const FAILURE: Record<FailureKind, { title: string; next: string }> = {
  quota: {
    title: "Today's free AI allowance is used up.",
    next: "Try again tomorrow. For an urgent question, switch this client to the private local model (slower).",
  },
  timeout: {
    title: "The AI model is busy.",
    next: "Wait a minute, then try again. A shorter question also helps.",
  },
  unavailable: {
    title: "Sage cannot reach an AI model right now.",
    next: "Try again in a minute. If it keeps failing, ask an admin to check the AI engine.",
  },
  invalid: {
    title: "The AI model gave steps Sage could not use.",
    next: "Try again, or split the request into shorter steps.",
  },
  unreadable: {
    title: "Sage could not read this file.",
    next: "Open it, save it as .xlsx or .csv, and add it again.",
  },
  stopped: {
    title: "You stopped this answer.",
    next: "Send the question again to restart it.",
  },
  dropped: {
    title: "The connection dropped.",
    next: "Check your connection, then try again.",
  },
};

export function failureKind(reason: unknown): FailureKind | null {
  return typeof reason === "string" && reason in FAILURE ? (reason as FailureKind) : null;
}

/** Plain words for an engine error message that names a damaged file. */
export function unreadableFile(message: string): string | null {
  return /unreadable file|not a usable xlsx/i.test(message) ? `${FAILURE.unreadable.title} ${FAILURE.unreadable.next}` : null;
}
