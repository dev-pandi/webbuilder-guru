// Template preview by ID — sama flow dengan /template-preview/:slug tapi
// terima UUID + tidak filter status (draft/archived juga accessible).
//
// Dipakai admin dashboard iframe live preview saat edit template. Karena
// UUID unguessable (122-bit entropy), aman tanpa auth. Kalau bocor ke publik,
// worst-case struktur block + theme template admin terlihat — no PII / data
// user leaked.

import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { PreviewLinkRewriter } from "@/components/PreviewLinkRewriter";
import { TemplatePreviewBadge } from "@/components/TemplatePreviewBadge";
import { findTemplatePage, getTemplatePreviewByID } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

// Bypass cache — admin edit-preview cycle butuh fresh data setiap navigate.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TemplatePreviewByIdPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const tpl = await getTemplatePreviewByID(params.id);
  if (!tpl) notFound();

  // Optional query param `?page=<slug>` untuk preview page selain home.
  const pageSlug = searchParams?.page ?? "";
  const page = findTemplatePage(tpl, pageSlug);
  if (!page) notFound();

  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(tpl.theme);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(tpl.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}

      <TemplatePreviewBadge
        templateName={tpl.name}
        category={tpl.category}
        variant={tpl.variant}
      />
      <PreviewLinkRewriter templateSlug={tpl.slug} />

      <RenderBlocks blocks={blocks} siteId="_template-preview" />
    </>
  );
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const tpl = await getTemplatePreviewByID(params.id);
  if (!tpl) return {};
  return {
    title: `Preview — ${tpl.name}`,
    description: tpl.description,
    // Draft/admin preview — jangan indexable.
    robots: { index: false, follow: false },
  };
}
