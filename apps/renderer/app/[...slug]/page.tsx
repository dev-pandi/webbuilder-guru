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
  return {
    title: page.seo?.title ?? page.title ?? site.name,
    description: page.seo?.description ?? "",
  };
}
