const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

export type ApiResult<T> = { data: T } | { error: { code: string; message: string } };

// ApiError menambah `status` + `code` di atas Error biasa. Callers boleh
// tetap pakai `(e as Error).message` — subclass ini fully backward compat.
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

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
    const code = "error" in body ? body.error.code : "";
    const msg = "error" in body ? body.error.message : `HTTP ${res.status}`;
    throw new ApiError(res.status, code, msg);
  }
  return (body as { data: T }).data;
}

// openBlob — fetch endpoint yang return binary (PDF, image) dengan Bearer
// token, lalu buka blob URL di tab baru. Dipakai untuk tombol "Cetak PDF"
// yang tidak bisa pakai <a href> biasa karena butuh Authorization header.
export async function openBlob(path: string): Promise<void> {
  const headers: Record<string, string> = {};
  const t = getAccessToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!res.ok) {
    // Coba parse error envelope JSON — kalau PDF endpoint return error,
    // biasanya JSON envelope, bukan binary.
    let msg = `HTTP ${res.status}`;
    let code = "";
    try {
      const body = (await res.json()) as ApiResult<unknown>;
      if ("error" in body) {
        msg = body.error.message;
        code = body.error.code;
      }
    } catch {
      // ignore — body bukan JSON
    }
    throw new ApiError(res.status, code, msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Revoke setelah 60 detik — browser sudah cache blob di tab baru.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
