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

// errMessage — defensive error → string extractor untuk catch blocks.
// Hindari pattern `(e as Error).message` yang throw lagi kalau e === null
// (common saat fetch abort / promise reject tanpa body) → Next.js 14
// unhandled rejection handler panic dengan "Cannot read properties of null
// (reading 'digest')".
//
// Pakai di semua catch block UI: `catch (e) { setErr(errMessage(e)); }`.
export function errMessage(e: unknown, fallback = "unknown error"): string {
  if (e instanceof Error) return e.message || fallback;
  if (e == null) return fallback;
  if (typeof e === "string") return e;
  try {
    return String(e);
  } catch {
    return fallback;
  }
}

// Paths yang tidak boleh trigger auto-redirect ke /login (mencegah loop).
// Semua route auth-related (login/register/verify/reset) di-skip.
const AUTH_PATH_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/daftar-reseller",
];

function isOnAuthPage(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return AUTH_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

// handleUnauthorized — dipanggil saat API return 401 (token invalid/expired).
// Clear tokens + redirect ke /login dengan ?next=<path saat ini> supaya user
// setelah login balik ke halaman yang dituju. Skip kalau:
//   - SSR (window undefined)
//   - Sudah di halaman auth (cegah redirect loop)
//   - Endpoint dipanggil dengan auth:false (public API, 401 bukan token issue)
function handleUnauthorized() {
  if (typeof window === "undefined") return;
  if (isOnAuthPage()) return;
  clearTokens();
  const current = window.location.pathname + window.location.search;
  const next = encodeURIComponent(current);
  // Pakai replace supaya user tidak bisa back ke halaman expired (bakal 401 lagi).
  window.location.replace(`/login?next=${next}`);
}

export async function api<T>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  const useAuth = opts.auth !== false;
  if (useAuth) {
    const t = getAccessToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as ApiResult<T>;
  if (!res.ok || "error" in body) {
    const code = "error" in body ? body.error.code : "";
    const msg = "error" in body ? body.error.message : `HTTP ${res.status}`;
    // Global 401 handler — token invalid/expired. Skip untuk request public
    // (auth:false) karena 401 di sana bukan issue token user.
    if (res.status === 401 && useAuth) {
      handleUnauthorized();
    }
    throw new ApiError(res.status, code, msg);
  }
  return (body as { data: T }).data;
}

// --- Guru (Rumah Digital Guru) types + helpers ---
// See spec: apps/api/internal/db/migrations/0048-0051.

export const GURU_RUBRICS = [
  "ceritaku",
  "bacaanku",
  "inspirasiku",
  "bangsaku",
  "peradaban",
  "forum-diskusi",
] as const;
export type GuruRubric = (typeof GURU_RUBRICS)[number];

export const GURU_RUBRIC_LABEL: Record<GuruRubric, string> = {
  ceritaku: "Ceritaku",
  bacaanku: "Bacaanku",
  inspirasiku: "Inspirasiku",
  bangsaku: "Bangsaku",
  peradaban: "Peradaban",
  "forum-diskusi": "Forum Diskusi",
};

export type ArticleStatus = "draft" | "published";

export type LiteraQuizQuestion = {
  question: string;
  options: string[]; // 4 opsi (A/B/C/D)
  correctOption: "A" | "B" | "C" | "D" | "";
};

export type LiteraQuiz = {
  passingScore: number;
  questions: LiteraQuizQuestion[];
};

export type Article = {
  id: string;
  site_id: string;
  rubric: GuruRubric;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  cover_image_url: string;
  tags: string[] | null;
  status: ArticleStatus;
  comments_enabled: boolean;
  reading_time_min: number;
  view_count: number;
  seo_title: string;
  seo_description: string;
  // Litera NFT integration (migration 0067)
  litera_enabled: boolean;
  litera_intent_id: string;
  litera_registered_at: string | null;
  litera_unlockable_url: string;
  litera_unlockable_description: string;
  litera_quiz_json: LiteraQuiz | Record<string, never>;
  litera_register_error: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LearningMaterial = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  cover_image_url: string;
  tags: string[] | null;
  summary: string;
  status: ArticleStatus;
  seo_title: string;
  seo_description: string;
  // Hierarki 1-level (0064): parent_id null = top-level materi.
  parent_id: string | null;
  sort_order: number;
  // Visual anchor di sidebar + landing (0065). Opsional 1 emoji.
  emoji: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ResponseStatus = "pending" | "approved" | "rejected";
export type ResponseRole = "guru" | "siswa" | "orang-tua" | "pembaca";

export const RESPONSE_ROLE_LABEL: Record<ResponseRole, string> = {
  guru: "Guru",
  siswa: "Siswa",
  "orang-tua": "Orang Tua",
  pembaca: "Pembaca",
};

export type ResponseItem = {
  id: string;
  site_id: string;
  // Parent polymorphic: tepat salah satu non-null (DB CHECK enforced).
  article_id: string | null;
  learning_material_id: string | null;
  author_name: string;
  author_role: ResponseRole;
  body: string;
  status: ResponseStatus;
  moderated_at: string | null;
  moderated_by_teacher_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BannerEffectiveStatus =
  | "active"
  | "teacher_off"
  | "admin_disabled"
  | "not_started"
  | "ended";

export const BANNER_STATUS_LABEL: Record<BannerEffectiveStatus, string> = {
  active: "Aktif",
  teacher_off: "Nonaktif oleh Guru",
  admin_disabled: "Dinonaktifkan oleh Admin",
  not_started: "Belum Mulai",
  ended: "Berakhir",
};

export type Banner = {
  id: string;
  site_id: string;
  owner_user_id: string;
  internal_title: string;
  image_url: string;
  target_url: string;
  alt_text: string;
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  teacher_active: boolean;
  admin_enabled: boolean;
  // portal_active — guru pilih 1 banner untuk tampil di landing Ruang Promosi
  // portal (kubaca.id). Max 1 per site — kalau enable pada banner
  // baru, backend auto-clear banner lain di site yang portal_active=true.
  portal_active: boolean;
  admin_disabled_reason: string;
  admin_disabled_by: string | null;
  admin_disabled_at: string | null;
  effective_status: BannerEffectiveStatus;
  created_at: string;
  updated_at: string;
};

export type SiteStats = {
  total_views: number;
  total_responses: number;
  total_articles: number;
};

// AdminBannerView — admin cross-site banner list. Extends Banner dengan info
// site + owner untuk moderasi platform (/admin/banners).
export type AdminBannerView = Banner & {
  site_name: string;
  site_slug: string;
  owner_name: string;
};

// TeacherDirectoryItem — kartu guru di portal direktori (§5.1).
export type TeacherDirectoryItem = {
  site_id: string;
  user_id: string;
  name: string;
  subject_or_field: string;
  profile_image: string;
  domain: string;
  total_views: number;
  created_at: string;
  is_new: boolean;
};

// PortalBanner — Ruang Promosi Portal (agregat cross-site).
export type PortalBanner = {
  id: string;
  site_id: string;
  image_url: string;
  target_url: string;
  alt_text: string;
};

// PlatformArticle — blog / knowledge base platform-level. Berbeda dari
// per-site Article (rubrik guru). Dipakai di homepage marketing + /artikel.
export type PlatformArticleCategory =
  | "umum" | "tutorial" | "cerita" | "tips" | "panduan" | "pengumuman";

export const PLATFORM_ARTICLE_CATEGORIES: Array<{ value: PlatformArticleCategory; label: string }> = [
  { value: "umum", label: "Umum" },
  { value: "tutorial", label: "Tutorial" },
  { value: "cerita", label: "Cerita" },
  { value: "tips", label: "Tips" },
  { value: "panduan", label: "Panduan" },
  { value: "pengumuman", label: "Pengumuman" },
];

export type PlatformArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  cover_image_url: string;
  category: PlatformArticleCategory;
  author_name: string;
  tags: string[] | null;
  status: "draft" | "published";
  featured: boolean;
  reading_time_min: number;
  view_count: number;
  seo_title: string;
  seo_description: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

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
