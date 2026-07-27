import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { SiteBodyEndCode, SiteHeadCode } from "@/components/CustomCode";
import { getPagePreview } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

// Preview is always-fresh — drafts evolve every few seconds during review.
export const dynamic = "force-dynamic";

// Tell crawlers to leave previews alone. The token itself is unguessable but
// noindex is belt+suspenders so accidentally-leaked URLs don't end up in SERPs.
export const metadata = {
  robots: { index: false, follow: false },
  title: "Pratinjau",
};

export default async function PreviewPage({
  params,
}: {
  params: { token: string };
}) {
  const data = await getPagePreview(params.token);
  if (!data) notFound();
  const { page, site } = data;
  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(site.theme);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}

      {/* Banner — visible "you are looking at a draft" affordance for the
          reviewer. Always at the top, doesn't push content (uses sticky bar
          inside a position:relative wrapper). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "linear-gradient(90deg, #f59e0b, #ef4444)",
          color: "#fff",
          textAlign: "center",
          padding: "6px 12px",
          fontSize: "12px",
          fontWeight: 600,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          letterSpacing: "0.05em",
        }}
      >
        🔍 PRATINJAU DRAFT — bukan versi live · link kadaluarsa otomatis dalam 1 jam
      </div>

      <SiteHeadCode site={site} />
      <RenderBlocks blocks={blocks} siteId={site.id} />
      <SiteBodyEndCode site={site} />
    </>
  );
}
