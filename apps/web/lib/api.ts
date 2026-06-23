const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

export type ApiResult<T> = { data: T } | { error: { code: string; message: string } };

function tokenKey() {
  return "wb_access_token";
}
function refreshKey() {
  return "wb_refresh_token";
}

export function setTokens(access: string, refresh: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(tokenKey(), access);
  localStorage.setItem(refreshKey(), refresh);
}
export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(tokenKey());
  localStorage.removeItem(refreshKey());
}
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(tokenKey());
}

export async function api<T>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.auth !== false) {
    const t = getAccessToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as ApiResult<T>;
  if (!res.ok || "error" in body) {
    const msg = "error" in body ? body.error.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (body as { data: T }).data;
}
