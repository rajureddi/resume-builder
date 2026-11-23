export async function api<T = Record<string, unknown>>(path: string, opts?: RequestInit & { json?: unknown }): Promise<T> {
  const response = await fetch(path, { ...opts, headers: { ...(opts?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(opts?.headers ?? {}) }, body: opts?.json !== undefined ? JSON.stringify(opts.json) : opts?.body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}
