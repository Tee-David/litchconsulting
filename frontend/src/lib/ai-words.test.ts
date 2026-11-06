import { describe, expect, it } from "vitest";
import { answeredBy, modelName, slotLabel } from "./ai-words";

describe("plain model words", () => {
  it("names models", () => {
    expect(modelName("openai/gpt-oss-120b")).toBe("GPT-OSS 120B");
    expect(modelName("@cf/openai/gpt-oss-20b")).toBe("GPT-OSS 20B");
    expect(modelName("qwen/qwen3.8-27b")).toBe("Qwen 3.8 27B");
    expect(modelName("llama-3.3-70b-versatile")).toBe("Llama 3.3 70B");
    expect(modelName("gemma3:4b")).toBe("Gemma 3 4B");
  });

  it("says who answered", () => {
    expect(answeredBy("groq:gpt-oss-20b", "openai/gpt-oss-20b", "cloud")).toBe(
      "Answered by GPT-OSS 20B on Groq (fast cloud, masked)",
    );
    expect(answeredBy("local", "gemma3:4b", "local")).toBe(
      "Answered by Gemma 3 4B on Litch's own server (private local model, slower)",
    );
    expect(slotLabel("groq:llama-3.1-8b-instant")).toBe("Groq (Llama 3.1 8B)");
  });
});
