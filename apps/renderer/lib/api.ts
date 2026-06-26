const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type Site = {
  id: string;
  slug: string;
  name: string;
  status: string;
  theme: ThemeJson | null;
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

async function fetchJson<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: 30 } });
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.json();
  return { ok: true, data: body.data as T };
}

export async function getSiteByHost(host: string): Promise<Site | null> {
  const r = await fetchJson<Site>(`/public/site-by-host?host=${encodeURIComponent(host)}`);
  return r.ok ? r.data : null;
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

// formatPrice — IDR aware, smallest-unit input (15000 → "Rp 15.000")
export function formatPrice(price: number, currency: string): string {
  if (currency === "IDR") return `Rp ${price.toLocaleString("id-ID")}`;
  return `${currency} ${price.toLocaleString("id-ID")}`;
}
