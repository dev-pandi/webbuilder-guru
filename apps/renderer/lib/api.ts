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
  seo: { title?: string; description?: string } | null;
  is_home: boolean;
};

export type Block = { type: string; props?: Record<string, unknown> };

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
