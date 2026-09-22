import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { GuruStyles } from "@/components/GuruBlocks";
import { SiteBodyEndCode, SiteHeadCode } from "@/components/CustomCode";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { getPage, getSiteByHost } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";
import { buildOrganization, buildWebSite, wrap } from "@/lib/schema";

export const dynamic = "force-dynamic";

export default async function CatchAll({ params }: { params: { slug: string[] } }) {
  const host = (headers().get("host") ?? "").toLowerCase().split(":")[0];
  const site = await getSiteByHost(host);
  if (!site) notFound();
  const slug = params.slug.join("/");
  const page = await getPage(site.id, slug);
  if (!page) notFound();
  // Compose blocks: site.layout.header (kalau ada + enabled) + page.tree.blocks +
  // site.layout.footer (kalau ada + enabled). Layout kosong `{}` atau flag
  // enabled=false → skip section itu (render page apa adanya).
  const headerEnabled = site.layout?.header_enabled !== false;
  const footerEnabled = site.layout?.footer_enabled !== false;
  const headerBlocks = headerEnabled ? site.layout?.header ?? [] : [];
  const footerBlocks = footerEnabled ? site.layout?.footer ?? [] : [];
  const pageBlocks = page.tree?.blocks ?? [];
  const blocks = [...headerBlocks, ...pageBlocks, ...footerBlocks];
  const fontHref = googleFontsUrl(site.theme);
  // Schema.org JSON-LD — inject WebSite + Organization di homepage, Organization
  // saja di sub-pages (WebSite cukup 1x per site sesuai Google guideline).
  const baseURL = `https://${host}`;
  const schemas = page.is_home
    ? [buildWebSite(site, baseURL), buildOrganization(site, baseURL)]
    : [buildOrganization(site, baseURL)];
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: wrap(schemas) }}
      />
      {/* Guru CSS injected unconditionally — scoped ke .guru-* jadi aman
          untuk non-Guru site. Previously bergantung block GuruStyles ada di
          tree, tapi setelah extraction migration blocks bisa geser posisi
          dan shared layout header (GuruNavbar) render sebelum GuruStyles
          block. */}
      <GuruStyles />
      <SiteHeadCode site={site} />
      <RenderBlocks blocks={blocks} siteId={site.id} />
      <PageViewBeacon siteId={site.id} pageSlug={page.is_home ? "" : slug} />
      <SiteBodyEndCode site={site} />
    </>
  );
}

export async function generateMetadata({ params }: { params: { slug: string[] } }) {
  const host = (headers().get("host") ?? "").toLowerCase().split(":")[0];
  const site = await getSiteByHost(host);
  if (!site) return {};
  const slug = params.slug.join("/");
  const page = await getPage(site.id, slug);
  if (!page) return {};
  const seo = page.seo ?? {};
  const title = seo.title || page.title || site.name;
  const description = seo.description || "";
  const og = seo.ogImage || undefined;
  return {
    title,
    description,
    robots: seo.noindex ? { index: false, follow: false } : undefined,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      images: og ? [{ url: og }] : undefined,
      siteName: site.name,
    },
    twitter: {
      card: og ? "summary_large_image" : "summary",
      title,
      description,
      images: og ? [og] : undefined,
    },
  };
}
