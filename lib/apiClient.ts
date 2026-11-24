import { getLocalLlmSettings } from "./localLlmSettings";
import { needsStudioSnapshot, persistComputedResult, studioSnapshotForRequest, tryLocalApi } from "./localApi";

const AI_ROUTES = new Set(["/api/test-llm", "/api/analyze-job", "/api/tailor-resume", "/api/ats-ai-notes", "/api/auto-fix-ats"]);

export async function api<T = Record<string, unknown>>(path: string, opts?: RequestInit & { json?: unknown }): Promise<T> {
  const method = opts?.method?.toUpperCase() ?? "GET";
  const local = tryLocalApi(path, method, opts?.json);
  if (local.handled) return local.data as T;
  let json = opts?.json;
  if (AI_ROUTES.has(path) && method === "POST") {
    const body = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
    json = { ...body, llmSettings: Object.hasOwn(body, "llmSettings") ? body.llmSettings : getLocalLlmSettings() };
  }
  if (needsStudioSnapshot(path, method)) {
    const body = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
    json = { ...body, studioData: studioSnapshotForRequest(path, body) };
  }
  const response = await fetch(path, { ...opts, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(opts?.headers ?? {}) }, body: json !== undefined ? JSON.stringify(json) : opts?.body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  persistComputedResult(path, data, json);
  return data;
}
