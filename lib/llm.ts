import { canPersistLlmSettings, getRawLlmSettings, saveRawLlmSettings, type RawLlmSettings } from "./db";
import type { LlmSettingsPublic } from "./types";

export const PROVIDER_PRESETS: Record<
  string,
  { label: string; baseUrl: string; model: string }
> = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
  },
  xai: {
    label: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "", model: "" },
};

export interface EffectiveSettings extends RawLlmSettings {
  source: "database" | "env" | "none";
  keyEnvVar?: "LLM_API_KEY" | "GROQ_API_KEY";
}

export const SETTINGS_STORAGE_ERROR =
  "Vercel cannot permanently save AI settings without a database. Set LLM_API_KEY, LLM_PROVIDER, LLM_BASE_URL and LLM_MODEL in Vercel Environment Variables, then redeploy. Or add DATABASE_URL to save settings in the app.";

export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  // Vercel's /tmp store is different across instances and disappears on restarts.
  // Never let a warm instance's old settings override deployment configuration.
  const db = canPersistLlmSettings() ? await getRawLlmSettings() : null;
  if (db && db.apiKey) return { ...db, source: "database" };
  const genericKey = process.env.LLM_API_KEY?.trim();
  const keyEnvVar = genericKey ? "LLM_API_KEY" : "GROQ_API_KEY";
  const envKey = genericKey || process.env.GROQ_API_KEY?.trim();
  if (envKey) {
    const provider = process.env.LLM_PROVIDER?.trim() || (genericKey ? "custom" : "groq");
    const preset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.custom;
    return {
      provider,
      baseUrl: (process.env.LLM_BASE_URL?.trim() || preset.baseUrl).replace(/\/+$/, ""),
      model: process.env.LLM_MODEL?.trim() || preset.model,
      apiKey: envKey,
      source: "env",
      keyEnvVar,
    };
  }
  if (db) return { ...db, source: "database" };
  return {
    provider: "groq",
    baseUrl: PROVIDER_PRESETS.groq.baseUrl,
    model: PROVIDER_PRESETS.groq.model,
    apiKey: "",
    source: "none",
  };
}

function maskKey(key: string): string | null {
  if (!key) return null;
  const prefix = key.startsWith("gsk_") ? "gsk_" : key.slice(0, 4);
  return `${prefix}••••••••${key.slice(-4)}`;
}

export function providerLabel(provider: string): string {
  return PROVIDER_PRESETS[provider]?.label ?? "LLM";
}

export function publicSettings(eff: EffectiveSettings): LlmSettingsPublic {
  const label = providerLabel(eff.provider);
  return {
    provider: eff.provider,
    baseUrl: eff.baseUrl,
    model: eff.model,
    hasKey: !!eff.apiKey,
    maskedKey: maskKey(eff.apiKey),
    statusLabel: eff.apiKey
      ? `AI: ${label} Configured`
      : `AI: No key — add ${label} API key`,
    source: eff.source,
    canSave: canPersistLlmSettings(),
    keyEnvVar: eff.keyEnvVar,
  };
}

export async function getPublicSettings(): Promise<LlmSettingsPublic> {
  return publicSettings(await getEffectiveSettings());
}

export async function saveSettings(input: {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}): Promise<LlmSettingsPublic> {
  if (!canPersistLlmSettings()) throw new Error(SETTINGS_STORAGE_ERROR);
  const existing = await getRawLlmSettings();
  const apiKey =
    input.apiKey && input.apiKey.trim()
      ? input.apiKey.trim()
      : (existing?.apiKey || (await getEffectiveSettings()).apiKey);
  await saveRawLlmSettings({
    provider: input.provider,
    baseUrl: input.baseUrl.replace(/\/$/, ""),
    model: input.model,
    apiKey,
  });
  return getPublicSettings();
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * One OpenAI-compatible chat call. Throws an Error with a plain-language
 * message on any failure — callers fall back to the rule engine.
 */
export async function llmChat(opts: {
  messages: ChatMessage[];
  timeoutMs?: number;
  maxTokens?: number;
  settings?: EffectiveSettings;
}): Promise<string> {
  const settings = opts.settings ?? (await getEffectiveSettings());
  if (!settings.apiKey) {
    throw new Error(`No ${providerLabel(settings.provider)} API key saved`);
  }
  const isGptOss = settings.model.includes("gpt-oss");
  const base = {
    model: settings.model,
    messages: opts.messages,
    temperature: 0.2,
    max_completion_tokens: opts.maxTokens ?? 2000,
  };
  const withOptional = isGptOss
    ? { ...base, reasoning_effort: "medium", response_format: { type: "json_object" } }
    : base;

  const attempt = async (payload: unknown): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error(
          `${providerLabel(settings.provider)} took too long to reply (timeout). Try again in a moment.`
        );
      }
      throw new Error(
        `Could not reach ${providerLabel(settings.provider)} (network error). Check the base URL: ${settings.baseUrl}`
      );
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Connection failed: the API key was rejected by ${providerLabel(settings.provider)}. Check the key and try again.`
        );
      }
      const err = new Error(
        `${providerLabel(settings.provider)} returned HTTP ${res.status}: ${body}`
      );
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("The model returned an empty reply");
    return content;
  };

  try {
    return await attempt(withOptional);
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 400 && isGptOss) {
      // Retry once without the optional fields some models reject.
      return attempt(base);
    }
    throw e;
  }
}

export function parseJsonLoose<T>(raw: string): T | null {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function llmJson<T>(opts: {
  system: string;
  user: string;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<T | null> {
  try {
    const raw = await llmChat({
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      timeoutMs: opts.timeoutMs,
      maxTokens: opts.maxTokens,
    });
    return parseJsonLoose<T>(raw);
  } catch {
    return null;
  }
}

export async function testConnection(savedSettings?: EffectiveSettings): Promise<{ ok: boolean; message: string }> {
  const settings = savedSettings ?? await getEffectiveSettings();
  const label = providerLabel(settings.provider);
  if (!settings.apiKey) {
    return {
      ok: false,
      message: canPersistLlmSettings()
        ? `Add your ${label} API key above and save it first, then tap Test Connection.`
        : SETTINGS_STORAGE_ERROR,
    };
  }
  if (!settings.baseUrl || !settings.model) {
    return { ok: false, message: "Set a base URL and model for your AI provider. For an environment key, set LLM_BASE_URL and LLM_MODEL, then redeploy." };
  }
  if (
    settings.provider === "groq" &&
    settings.baseUrl.replace(/\/+$/, "") === PROVIDER_PRESETS.groq.baseUrl &&
    !settings.apiKey.startsWith("gsk_")
  ) {
    return {
      ok: false,
      message:
        "This key does not look like a Groq key — Groq keys start with gsk_. An xAI/Grok key will not work on Groq. Create one at console.groq.com → API Keys.",
    };
  }
  try {
    const reply = await llmChat({
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      timeoutMs: 10000,
      maxTokens: 32,
      settings,
    });
    return {
      ok: true,
      message: `Connected — ${label} (${settings.model}) replied: "${reply.trim().slice(0, 40)}"`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection failed" };
  }
}
