// Dynamic sitemap.xml per host — Next.js multi-tenant renderer resolve site
// dari `Host` header, lalu enumerate: home + pages + blog + products.
//
// Kenapa custom route (bukan Next.js `app/sitemap.ts` convention): sitemap
// convention di-generate compile-time single-tenant; kita perlu request-time
// karena setiap Host = tenant berbeda.
//
// Cached 5 menit di edge (`s-maxage=300`) — crawler yang polite hit sitemap
// jarang; kalau site update, cache TTL cukup pendek.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  getSiteByHost,
  listPages,
  listBlogPosts,
  listProducts,
  listArticles,
  listLearningMaterials,
  GURU_RUBRICS,
} from "@/lib/api";

export const revalidate = 300; // 5 menit ISR fallback

export async function GET() {
  const host = (await headers()).get("host") ?? "";
  const site = await getSiteByHost(host);
  if (!site) {
    return new NextResponse("Site not found", { status: 404 });
  }

  const baseURL = `https://${host}`;
  const now = new Date().toISOString();

  const urls: Array<{ loc: string; lastmod?: string; priority?: number; changefreq?: string }> = [];

  // Root/home — priority 1.
  urls.push({ loc: `${baseURL}/`, lastmod: now, priority: 1.0, changefreq: "weekly" });

  // Sub-pages — priority 0.8. Skip home page karena sudah di-cover root.
  try {
    const pages = await listPages(site.id);
    for (const p of pages) {
      if (p.is_home) continue;
      urls.push({
        loc: `${baseURL}/${p.slug}`,
        lastmod: now,
        priority: 0.8,
        changefreq: "monthly",
      });
    }
  } catch {
    /* pages endpoint down — skip section */
  }

  // Blog posts — priority 0.6.
  try {
    const posts = await listBlogPosts(site.id, 200);
    for (const post of posts) {
      urls.push({
        loc: `${baseURL}/blog/${post.slug}`,
        lastmod: post.published_at ?? now,
        priority: 0.6,
        changefreq: "weekly",
      });
    }
  } catch {
    /* blog optional — skip */
  }

  // Products — priority 0.7.
  try {
    const products = await listProducts(site.id, 500);
    for (const prod of products) {
      urls.push({
        loc: `${baseURL}/produk/${prod.slug}`,
        lastmod: now,
        priority: 0.7,
        changefreq: "weekly",
      });
    }
  } catch {
    /* products optional */
  }

  // Guru articles — 6 rubric × 100 max. Priority 0.7 karena artikel guru
  // adalah primary content. Loop per rubric supaya URL punya struktur
  // /{rubric}/{slug} sesuai routing spec §31.
  for (const rubric of GURU_RUBRICS) {
    try {
      const articles = await listArticles(site.id, rubric, 100);
      for (const a of articles) {
        urls.push({
          loc: `${baseURL}/${rubric}/${a.slug}`,
          lastmod: a.published_at ?? a.updated_at ?? now,
          priority: 0.7,
          changefreq: "weekly",
        });
      }
    } catch {
      /* rubric optional — skip on failure */
    }
  }

  // Learning materials — priority 0.6 (utilitas, tapi valuable untuk SEO).
  try {
    const materials = await listLearningMaterials(site.id, 200);
    for (const m of materials) {
      urls.push({
        loc: `${baseURL}/pembelajaran/${m.slug}`,
        lastmod: m.published_at ?? m.updated_at ?? now,
        priority: 0.6,
        changefreq: "monthly",
      });
    }
  } catch {
    /* materials optional */
  }

  const xml = renderSitemap(urls);
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}

function renderSitemap(
  urls: Array<{ loc: string; lastmod?: string; priority?: number; changefreq?: string }>,
): string {
  const items = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXML(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${escapeXML(u.lastmod)}</lastmod>` : ""}
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}
    ${u.priority != null ? `<priority>${u.priority.toFixed(1)}</priority>` : ""}
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
