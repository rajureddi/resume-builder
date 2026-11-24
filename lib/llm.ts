import { normalizeLlmSettings, PROVIDER_PRESETS, publicSettings, providerLabel, type LlmSettings } from "./llmSettings";
export { PROVIDER_PRESETS, publicSettings, providerLabel } from "./llmSettings";

export interface EffectiveSettings extends LlmSettings {
  source: "local" | "none";
}

// Credentials belong to the browser. Each AI request supplies its own snapshot;
// they are never read from a database, environment variable or server file.
export async function getEffectiveSettings(input?: unknown): Promise<EffectiveSettings> {
  const settings = normalizeLlmSettings(input);
  return settings ? { ...settings, source: "local" } : {
    provider: "groq", baseUrl: PROVIDER_PRESETS.groq.baseUrl,
    model: PROVIDER_PRESETS.groq.model, apiKey: "", source: "none",
  };
}

export async function getPublicSettings() {
  return publicSettings(null);
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
      const body = (await res.text()).split(settings.apiKey).join("[redacted]").slice(0, 300);
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
  settings?: EffectiveSettings;
}): Promise<T | null> {
  try {
    const raw = await llmChat({
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      timeoutMs: opts.timeoutMs,
      maxTokens: opts.maxTokens,
      settings: opts.settings,
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
      message: "Add your API key in AI Settings and choose Save on this device, then test the connection.",
    };
  }
  if (!settings.baseUrl || !settings.model) {
    return { ok: false, message: "Enter a base URL and model in AI Settings, then save on this device." };
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
