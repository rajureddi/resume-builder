import { normalizeLlmSettings, publicSettings, type LlmSettings } from "./llmSettings";

export const LOCAL_LLM_SETTINGS_KEY = "resume-studio.ai-settings.v1";

export function getLocalLlmSettings(): LlmSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_LLM_SETTINGS_KEY);
    return raw ? normalizeLlmSettings(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function saveLocalLlmSettings(input: unknown): LlmSettings {
  const settings = normalizeLlmSettings(input);
  if (!settings) throw new Error("Enter a provider, a valid HTTP(S) base URL, a model and an API key.");
  try {
    window.localStorage.setItem(LOCAL_LLM_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    throw new Error("This browser could not save your API settings. Allow site storage and try again.");
  }
  return settings;
}

export function clearLocalLlmSettings(): void {
  try { window.localStorage.removeItem(LOCAL_LLM_SETTINGS_KEY); }
  catch { throw new Error("This browser could not remove your saved API settings. Check site storage permissions."); }
}

export function getLocalPublicSettings() {
  return publicSettings(getLocalLlmSettings());
}
