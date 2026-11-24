import type { LlmSettingsPublic } from "./types";

export interface LlmSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const PROVIDER_PRESETS: Record<string, { label: string; baseUrl: string; model: string }> = {
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  xai: { label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", model: "grok-4" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "", model: "" },
};

export function normalizeLlmSettings(input: unknown): LlmSettings | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fields = input as Record<string, unknown>;
  for (const [field, limit] of [["provider", 40], ["baseUrl", 2048], ["model", 200], ["apiKey", 4000]] as const) {
    const value = fields[field];
    if (typeof value !== "string" || !value.trim() || value.length > limit) return null;
  }
  const provider = (fields.provider as string).trim();
  if (!Object.hasOwn(PROVIDER_PRESETS, provider)) return null;
  const baseUrl = (fields.baseUrl as string).trim().replace(/\/+$/, "");
  try {
    const url = new URL(baseUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
  } catch { return null; }
  return { provider, baseUrl, model: (fields.model as string).trim(), apiKey: (fields.apiKey as string).trim() };
}

export function providerLabel(provider: string): string {
  return PROVIDER_PRESETS[provider]?.label ?? "LLM";
}

export function publicSettings(settings: LlmSettings | null): LlmSettingsPublic {
  const config = settings ?? { provider: "groq", ...PROVIDER_PRESETS.groq, apiKey: "" };
  const key = config.apiKey;
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    hasKey: !!key,
    maskedKey: key ? (key.length <= 8 ? "••••••••" : `${key.slice(0, 4)}••••••••${key.slice(-4)}`) : null,
    statusLabel: key ? `AI: ${providerLabel(config.provider)} Configured on this device` : "AI: No key — add one in AI Settings",
    source: key ? "local" : "none",
  };
}
