// Template live preview — render homepage template seperti site production.
// Dipakai admin panel + wizard client (iframe modal) untuk lihat template
// SEBELUM di-apply ke site. Tanpa auth (published template public browseable).
//
// Flow:
//   1. Fetch /public/template-preview/:slug (API side)
//   2. Inject theme CSS variables + Google Fonts link
//   3. Render is_home page's block tree pakai component sama seperti site render
//   4. Kalau template multi-page, link "Lihat page lain" navigasi ke sub-route

import Link from "next/link";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { TemplatePreviewBadge } from "@/components/TemplatePreviewBadge";
import { findTemplatePage, getTemplatePreview } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

// Preview boleh cache ringan (10s) — template config admin bisa berubah tapi
// tidak perlu real-time; refresh browser cukup.
export const revalidate = 10;

export default async function TemplatePreviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const tpl = await getTemplatePreview(params.slug);
  if (!tpl) notFound();

  const page = findTemplatePage(tpl, "");
  if (!page) notFound();

  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(tpl.theme);
  const otherPages = tpl.pages.filter((p) => !p.is_home && p.slug !== page.slug);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(tpl.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}

      <TemplatePreviewBadge
        templateName={tpl.name}
        category={tpl.category}
        variant={tpl.variant}
      />

      <RenderBlocks blocks={blocks} siteId="_template" />

      {/* Multi-page navigator — floating card di bawah, hanya tampil kalau
          template punya > 1 page. Link ke sub-route yang render page lain
          dalam preview yang sama. */}
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
                  href={`/_template-preview/${tpl.slug}/${p.slug}`}
                  style={{ color: "white", textDecoration: "underline" }}
                >
                  {p.title || p.slug}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const tpl = await getTemplatePreview(params.slug);
  if (!tpl) return {};
  return {
    title: `Preview — ${tpl.name}`,
    description: tpl.description,
    // Preview page shouldn't be indexed oleh search engine.
    robots: { index: false, follow: false },
  };
}
