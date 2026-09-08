// Learning material detail — `/pembelajaran/{slug}` (spec §19.2).
// Rute static `pembelajaran` menang atas dynamic `[rubric]` (Next.js
// precedence), sehingga slug materi tidak salah-mate ke rubric handler.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getLearningMaterial, getSiteByHost } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { SiteBodyEndCode, SiteHeadCode } from "@/components/CustomCode";
import { GuruStyles } from "@/components/GuruBlocks";

export const dynamic = "force-dynamic";

marked.setOptions({ gfm: true, breaks: false });
marked.use({ renderer: { html: () => "" } });

function host() {
  return (headers().get("host") ?? "").toLowerCase().split(":")[0];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function LearningMaterialDetail({
  params,
}: {
  params: { slug: string };
}) {
  const site = await getSiteByHost(host());
  if (!site) notFound();
  const m = await getLearningMaterial(site.id, params.slug);
  if (!m) notFound();

  const fontHref = googleFontsUrl(site.theme);
  const html = await marked.parse(m.body_md ?? "");
  const tags = Array.isArray(m.tags) ? m.tags : [];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <GuruStyles />
      <SiteHeadCode site={site} />
      <PageViewBeacon
        siteId={site.id}
        pageSlug={`/pembelajaran/${params.slug}`}
      />

      <article className="guru-article-detail">
        <div className="guru-article-detail__meta">
          <a href="/pembelajaran">Pembelajaran</a>
          {m.published_at ? <span>{fmtDate(m.published_at)}</span> : null}
        </div>

        <h1>{m.title}</h1>

        {m.excerpt ? (
          <p className="guru-article-detail__deck">{m.excerpt}</p>
        ) : null}

        {m.cover_image_url && (
          <div className="guru-article-detail__cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.cover_image_url} alt={m.title} />
          </div>
        )}

        <div
          className="guru-article-detail__body"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {m.summary && (
          <div
            className="guru-article-detail__body"
            style={{
              background: "#fbfaf7",
              border: "1px solid #e6e9ef",
              borderRadius: 12,
              padding: "16px 20px",
              marginTop: 24,
              fontSize: ".95rem",
            }}
          >
            <strong style={{ display: "block", marginBottom: 8, color: "#172033" }}>
              Ringkasan
            </strong>
            {m.summary}
          </div>
        )}

        {tags.length > 0 && (
          <div className="guru-article-detail__tags">
            {tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
      </article>

      <SiteBodyEndCode site={site} />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const site = await getSiteByHost(host());
  if (!site) return {};
  const m = await getLearningMaterial(site.id, params.slug);
  if (!m) return {};
  const title = m.seo_title || `${m.title} — ${site.name}`;
  const description = m.seo_description || m.excerpt || "";
  return {
    title,
    description,
    openGraph: m.cover_image_url
      ? { title, description, images: [{ url: m.cover_image_url }] }
      : { title, description },
  };
}
