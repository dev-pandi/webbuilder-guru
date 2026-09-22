const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type Site = {
  id: string;
  slug: string;
  name: string;
  status: string;
  theme: ThemeJson | null;
  // Shared header/footer per site — renderer prepend header + append footer
  // ke setiap page saat render. `{}` = no layout, page render apa adanya.
  layout?: SiteLayout | null;
  // Raw HTML/JS user, di-inject persis di </head> dan </body>. Renderer
  // MEMBACA field ini via dangerouslySetInnerHTML — sengaja tidak sanitize
  // karena kasus penggunaan (GTM, Meta Pixel) butuh raw script tags.
  custom_head_code?: string;
  custom_body_end_code?: string;
};

export type SiteLayout = {
  header?: Block[];
  footer?: Block[];
  // Enabled flags — kalau false, renderer skip prepend header / append footer
  // walaupun blocks-nya ada. Default true untuk backward compat (site lama
  // yang tidak punya field ini tetap render shared layout).
  header_enabled?: boolean;
  footer_enabled?: boolean;
};

export type ThemeJson = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };
  radius?: string;
};

export type Page = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  tree: { blocks?: Block[] } | null;
  seo: {
    title?: string;
    description?: string;
    ogImage?: string;
    canonical?: string;
    noindex?: boolean;
  } | null;
  is_home: boolean;
};

export type Block = {
  type: string;
  props?: Record<string, unknown>;
  // Nested children — populated only for container-style blocks (Container,
  // Columns). The renderer recursively walks this when present.
  children?: Block[];
  // Per-block wrapper metadata (padding/margin/maxWidth/align/bg + colour
  // override). All optional — set in the editor's Layout & Style panel.
  layout?: {
    pt?: number; pr?: number; pb?: number; pl?: number;
    mt?: number; mb?: number;
    maxWidth?: "full" | "narrow" | "prose" | "wide";
    align?: "left" | "center" | "right";
    bg?: string;
    hidden?: { mobile?: boolean; tablet?: boolean; desktop?: boolean };
    responsive?: {
      tablet?: ResponsivePatch;
      desktop?: ResponsivePatch;
    };
  };
  themeOverride?: { primary?: string; secondary?: string; bg?: string; fg?: string };
};

type ResponsivePatch = {
  pt?: number; pr?: number; pb?: number; pl?: number;
  mt?: number; mb?: number;
  maxWidth?: "full" | "narrow" | "prose" | "wide";
  align?: "left" | "center" | "right";
  bg?: string;
};

// fetchJson — helper untuk /public/* endpoints. Default revalidate short
// (5 detik) karena user edit theme/pages di dashboard, expect update visible
// segera di renderer. Cache tetap ada supaya spike traffic tidak hammer API.
// Untuk endpoint yang jarang berubah (products/blog) bisa override via
// fetchJsonCached dengan TTL lebih panjang.
async function fetchJson<T>(path: string, revalidateSec = 5): Promise<{ ok: true; data: T } | { ok: false; status: number; code?: string }> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: revalidateSec } });
  if (!res.ok) {
    // Parse error envelope kalau ada supaya caller bisa branch berdasarkan
    // business code (mis. site_not_published vs no_site_for_host).
    let code: string | undefined;
    try {
      const err = await res.json();
      if (err?.error?.code) code = String(err.error.code);
    } catch {
      // Body bukan JSON valid, biarkan code undefined.
    }
    return { ok: false, status: res.status, code };
  }
  const body = await res.json();
  return { ok: true, data: body.data as T };
}

// SiteLookup — hasil resolve host, dengan reason kalau site tidak return.
// `reason` = "site_not_published" berarti site ada tapi status draft;
// `reason` = "no_site_for_host" berarti host tidak ter-attach ke site mana pun.
export type SiteLookup =
  | { kind: "found"; site: Site }
  | { kind: "not_found"; reason: "site_not_published" | "no_site_for_host" | "unknown" };

export async function lookupSiteByHost(host: string): Promise<SiteLookup> {
  const r = await fetchJson<Site>(`/public/site-by-host?host=${encodeURIComponent(host)}`);
  if (r.ok) return { kind: "found", site: r.data };
  const reason =
    r.code === "site_not_published"
      ? "site_not_published"
      : r.code === "no_site_for_host"
      ? "no_site_for_host"
      : "unknown";
  return { kind: "not_found", reason };
}

// Backward-compat helper — caller yang cuma butuh Site atau null.
export async function getSiteByHost(host: string): Promise<Site | null> {
  const r = await lookupSiteByHost(host);
  return r.kind === "found" ? r.site : null;
}

export async function getPage(siteId: string, slug: string): Promise<Page | null> {
  const r = await fetchJson<Page>(`/public/sites/${siteId}/pages/${encodeURIComponent(slug)}`);
  return r.ok ? r.data : null;
}

export async function listPages(siteId: string): Promise<Page[]> {
  const r = await fetchJson<Page[]>(`/public/sites/${siteId}/pages`);
  return r.ok ? r.data : [];
}

// getPagePreview fetches the DRAFT tree of a page via a signed HMAC token,
// bundled with its owning site (for theme + font). Cache disabled so the
// reviewer always sees the freshest draft.
export async function getPagePreview(
  token: string,
): Promise<{ page: Page; site: Site } | null> {
  const res = await fetch(`${API}/public/preview/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.data as { page: Page; site: Site };
}

// --- Products + Blog (public read) ---

export type Product = {
  id: string;
  site_id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number | null;
  image_url: string;
  gallery: string[] | null;
  category: string;
  status: string;
};

export type BlogPost = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_md: string;
  cover_image_url: string;
  author_name: string;
  tags: string[] | null;
  status: string;
  published_at: string | null;
};

export async function listProducts(siteId: string, limit = 20): Promise<Product[]> {
  const r = await fetchJson<Product[]>(`/public/sites/${siteId}/products?limit=${limit}`);
  return r.ok ? r.data : [];
}

export async function getProduct(siteId: string, slug: string): Promise<Product | null> {
  const r = await fetchJson<Product>(`/public/sites/${siteId}/products/${encodeURIComponent(slug)}`);
  return r.ok ? r.data : null;
}

export async function listBlogPosts(siteId: string, limit = 20): Promise<BlogPost[]> {
  const r = await fetchJson<BlogPost[]>(`/public/sites/${siteId}/blog-posts?limit=${limit}`);
  return r.ok ? r.data : [];
}

export async function getBlogPost(siteId: string, slug: string): Promise<BlogPost | null> {
  const r = await fetchJson<BlogPost>(`/public/sites/${siteId}/blog-posts/${encodeURIComponent(slug)}`);
  return r.ok ? r.data : null;
}

// --- Forms (public read for renderer) ---

export type FormField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "url";
  required?: boolean;
  placeholder?: string;
};

export type PublicForm = {
  id: string;
  site_id: string;
  name: string;
  kind: string;
  fields: FormField[] | null;
};

// Fetch definisi form (fields, kind, name) untuk render di renderer. Endpoint
// public — TIDAK expose notify_email. UUID validation dilakukan di backend, kita
// pass-through saja (invalid → 400 → return null).
export async function getPublicForm(id: string): Promise<PublicForm | null> {
  if (!id) return null;
  const r = await fetchJson<PublicForm>(`/public/forms/${encodeURIComponent(id)}`);
  return r.ok ? r.data : null;
}

// formatPrice — IDR aware, smallest-unit input (15000 → "Rp 15.000")
export function formatPrice(price: number, currency: string): string {
  if (currency === "IDR") return `Rp ${price.toLocaleString("id-ID")}`;
  return `${currency} ${price.toLocaleString("id-ID")}`;
}

// -------- Guru (Rumah Digital Guru) — Fase 4 renderer integration --------

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

export function isGuruRubric(s: string): s is GuruRubric {
  return (GURU_RUBRICS as readonly string[]).includes(s);
}

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
  status: string;
  comments_enabled: boolean;
  reading_time_min: number;
  view_count: number;
  seo_title: string;
  seo_description: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

// ArticleListItem — kartu di list endpoint punya field tambahan response_count.
export type ArticleListItem = Article & {
  response_count: number;
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
  status: string;
  seo_title: string;
  seo_description: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ResponseRole = "guru" | "siswa" | "orang-tua" | "pembaca";
export const RESPONSE_ROLE_LABEL: Record<ResponseRole, string> = {
  guru: "Guru",
  siswa: "Siswa",
  "orang-tua": "Orang Tua",
  pembaca: "Pembaca",
};

export type PublicResponse = {
  id: string;
  author_name: string;
  author_role: ResponseRole;
  body: string;
  created_at: string;
};

export type PublicBanner = {
  id: string;
  image_url: string;
  target_url: string;
  alt_text: string;
  sort_order: number;
};

export type SiteStats = {
  total_views: number;
  total_responses: number;
  total_articles: number;
};

// ArticleDetail — response envelope untuk /public/sites/:id/articles/:rubric/:slug
export type ArticleDetail = {
  article: Article;
  response_count: number;
};

// Detail endpoint bumps view counter — jangan cache. Listing OK cache pendek.
const GURU_LIST_TTL = 15;

export async function listArticles(
  siteId: string,
  rubric?: GuruRubric,
  limit = 20,
): Promise<ArticleListItem[]> {
  const p = new URLSearchParams({ limit: String(limit) });
  if (rubric) p.set("rubric", rubric);
  const r = await fetchJson<ArticleListItem[]>(
    `/public/sites/${siteId}/articles?${p}`,
    GURU_LIST_TTL,
  );
  return r.ok ? r.data : [];
}

export async function getArticle(
  siteId: string,
  rubric: GuruRubric,
  slug: string,
): Promise<ArticleDetail | null> {
  // No cache — detail endpoint increments view counter.
  const r = await fetchJson<ArticleDetail>(
    `/public/sites/${siteId}/articles/${rubric}/${encodeURIComponent(slug)}`,
    0,
  );
  return r.ok ? r.data : null;
}

export async function listArticleResponses(
  siteId: string,
  articleId: string,
  limit = 200,
): Promise<PublicResponse[]> {
  const r = await fetchJson<PublicResponse[]>(
    `/public/sites/${siteId}/articles/${articleId}/responses?limit=${limit}`,
    GURU_LIST_TTL,
  );
  return r.ok ? r.data : [];
}

export async function listLatestArticles(
  siteId: string,
  limit = 6,
): Promise<Article[]> {
  const r = await fetchJson<Article[]>(
    `/public/sites/${siteId}/latest-articles?limit=${limit}`,
    GURU_LIST_TTL,
  );
  return r.ok ? r.data : [];
}

export async function getSiteStats(siteId: string): Promise<SiteStats | null> {
  const r = await fetchJson<SiteStats>(
    `/public/sites/${siteId}/site-stats`,
    GURU_LIST_TTL,
  );
  return r.ok ? r.data : null;
}

export async function listLearningMaterials(
  siteId: string,
  limit = 20,
): Promise<LearningMaterial[]> {
  const r = await fetchJson<LearningMaterial[]>(
    `/public/sites/${siteId}/learning-materials?limit=${limit}`,
    GURU_LIST_TTL,
  );
  return r.ok ? r.data : [];
}

export async function getLearningMaterial(
  siteId: string,
  slug: string,
): Promise<LearningMaterial | null> {
  const r = await fetchJson<LearningMaterial>(
    `/public/sites/${siteId}/learning-materials/${encodeURIComponent(slug)}`,
  );
  return r.ok ? r.data : null;
}

// Cache banner promosi lebih pendek dari list konten lainnya. Guru sering
// ubah banner (aktifkan/nonaktifkan, tambah baru dengan periode terbatas)
// dan expect update reflect segera di renderer. 5 detik jaga balance antara
// freshness dan spare load ke API.
const BANNER_TTL = 5;

export async function listPromotionBanners(
  siteId: string,
): Promise<PublicBanner[]> {
  const r = await fetchJson<PublicBanner[]>(
    `/public/sites/${siteId}/promotion-banners`,
    BANNER_TTL,
  );
  return r.ok ? r.data : [];
}

// -------- Template live preview (plan-admin-templates.md Phase 2) --------

export type TemplatePreviewPage = {
  slug: string;
  title: string;
  is_home: boolean;
  tree: { blocks?: Block[] } | null;
  seo: {
    title?: string;
    description?: string;
    ogImage?: string;
    canonical?: string;
    noindex?: boolean;
  } | null;
};

export type TemplatePreview = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  variant: string;
  theme: ThemeJson | null;
  pages: TemplatePreviewPage[];
};

// getTemplatePreview — fetch template lengkap dengan semua pages + theme,
// dipakai renderer route `/template-preview/:slug` untuk render HTML live.
// Kalau template belum published atau slug tidak ada → null (renderer 404).
export async function getTemplatePreview(slug: string): Promise<TemplatePreview | null> {
  if (!slug) return null;
  const r = await fetchJson<TemplatePreview>(
    `/public/template-preview/${encodeURIComponent(slug)}`,
  );
  return r.ok ? r.data : null;
}

// getTemplatePreviewByID — sama seperti getTemplatePreview tapi accept UUID
// dan return template regardless of status (draft/archived/published).
// Dipakai admin dashboard untuk live preview template saat editing.
// Bypass cache (revalidate 0) karena admin edit-preview cycle butuh fresh.
export async function getTemplatePreviewByID(
  id: string,
): Promise<TemplatePreview | null> {
  if (!id) return null;
  const r = await fetchJson<TemplatePreview>(
    `/public/template-preview-by-id/${encodeURIComponent(id)}`,
    0, // bypass cache — admin preview harus reflect state DB terbaru
  );
  return r.ok ? r.data : null;
}

// findTemplatePage — helper untuk cari page berdasarkan slug (atau home page
// kalau slug kosong). Return null kalau tidak ketemu.
export function findTemplatePage(
  tpl: TemplatePreview,
  pageSlug: string,
): TemplatePreviewPage | null {
  if (!pageSlug || pageSlug === "_home") {
    return tpl.pages.find((p) => p.is_home) ?? tpl.pages[0] ?? null;
  }
  return tpl.pages.find((p) => p.slug === pageSlug) ?? null;
}
