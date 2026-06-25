import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { getPage, getSiteByHost } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function CatchAll({ params }: { params: { slug: string[] } }) {
  const host = (headers().get("host") ?? "").toLowerCase().split(":")[0];
  const site = await getSiteByHost(host);
  if (!site) notFound();
  const slug = params.slug.join("/");
  const page = await getPage(site.id, slug);
  if (!page) notFound();
  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(site.theme);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <RenderBlocks blocks={blocks} siteId={site.id} />
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
