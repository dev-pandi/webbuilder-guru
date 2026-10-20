// Template preview — sub-page. Render page bukan-home dalam template.
// Reuse pattern dari root preview page.

import Link from "next/link";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { PreviewLinkRewriter } from "@/components/PreviewLinkRewriter";
import { TemplatePreviewBadge } from "@/components/TemplatePreviewBadge";
import { findTemplatePage, getTemplatePreview } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

export const revalidate = 10;

export default async function TemplatePreviewPageSub(
  props: {
    params: Promise<{ slug: string; pageSlug: string }>;
  }
) {
  const params = await props.params;
  const tpl = await getTemplatePreview(params.slug);
  if (!tpl) notFound();

  const page = findTemplatePage(tpl, params.pageSlug);
  if (!page) notFound();

  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(tpl.theme);
  // Semua page LAIN dari yang sedang di-render (termasuk home) — untuk nav.
  const otherPages = tpl.pages.filter((p) => p.slug !== page.slug);

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

      <RenderBlocks blocks={blocks} siteId="_template" />

      {otherPages.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "1rem",
            right: "1rem",
            zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            color: "white",
            padding: "0.75rem 1rem",
            borderRadius: "0.75rem",
            fontSize: "0.75rem",
            maxWidth: "16rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <p style={{ margin: 0, marginBottom: "0.5rem", opacity: 0.7 }}>
            Halaman lain dalam template ini:
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {otherPages.map((p) => (
              <li key={p.slug} style={{ marginBottom: "0.25rem" }}>
                <Link
                  href={
                    p.is_home
                      ? `/template-preview/${tpl.slug}`
                      : `/template-preview/${tpl.slug}/${p.slug}`
                  }
                  style={{ color: "white", textDecoration: "underline" }}
                >
                  {p.title || p.slug}
                  {p.is_home && (
                    <span style={{ opacity: 0.6, marginLeft: "0.25rem" }}>(home)</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string; pageSlug: string }>;
  }
) {
  const params = await props.params;
  const tpl = await getTemplatePreview(params.slug);
  if (!tpl) return {};
  const page = findTemplatePage(tpl, params.pageSlug);
  return {
    title: `Preview — ${tpl.name} · ${page?.title ?? params.pageSlug}`,
    robots: { index: false, follow: false },
  };
}
