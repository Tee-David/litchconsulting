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

const PROVIDER_NAMES: Record<string, string> = {
  groq: "Groq",
  cloudflare: "Cloudflare",
  cerebras: "Cerebras",
  sambanova: "SambaNova",
  openrouter: "OpenRouter",
  local: "Litch's own server",
  chat: "a cloud provider",
};

/** "groq:gpt-oss-20b" → "Groq". Each Groq model is its own slot in the chain. */
export function providerName(slot: string | null | undefined): string {
  if (!slot) return "";
  return PROVIDER_NAMES[slot.split(":")[0]] ?? slot;
}

/** A model id in plain words: "openai/gpt-oss-120b" → "GPT-OSS 120B". */
export function modelName(model: string | null | undefined): string {
  if (!model) return "";
  const id = model.split("/").pop() ?? model;
  const known: [RegExp, string][] = [
    [/gpt-oss-?(\d+)b/i, "GPT-OSS $1B"],
    [/qwen[-_]?([\d.]+)[-_](\d+)b/i, "Qwen $1 $2B"],
    [/llama-?([\d.]+)-(\d+)b/i, "Llama $1 $2B"],
    [/gemma-?(\d+):?(\d+)b/i, "Gemma $1 $2B"],
  ];
  for (const [re, out] of known) {
    const m = id.match(re);
    if (m) return out.replace("$1", m[1]).replace("$2", m[2] ?? "").trim();
  }
  return id;
}

/** "Answered by GPT-OSS 20B on Groq (fast cloud, masked)". */
export function answeredBy(slot: string | null | undefined, model: string | null | undefined, kind?: string | null): string {
  const m = modelName(model);
  const p = providerName(slot);
  const how = engineLabel(kind ?? (slot === "local" ? "local" : "cloud")).toLowerCase();
  if (!m && !p) return "";
  return `Answered by ${m || "a model"}${p ? ` on ${p}` : ""} (${how})`;
}

/** A chain slot in plain words for fallback notes: "Groq (GPT-OSS 20B)". */
export function slotLabel(slot: string | null | undefined): string {
  if (!slot) return "";
  const [prov, model] = slot.split(":");
  const p = providerName(prov);
  return model ? `${p} (${modelName(model)})` : p;
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
