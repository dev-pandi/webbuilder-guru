// Learning material detail — `/pembelajaran/{slug}` (spec §19.2).
// Rute static `pembelajaran` menang atas dynamic `[rubric]` (Next.js
// precedence), sehingga slug materi tidak salah-mate ke rubric handler.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { marked } from "@/lib/markdown";
import {
  getLearningMaterial,
  getSiteByHost,
  listMaterialResponses,
  RESPONSE_ROLE_LABEL,
  type PublicResponse,
} from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { SiteBodyEndCode, SiteHeadCode } from "@/components/CustomCode";
import { GuruStyles } from "@/components/GuruBlocks";
import { GuruResponseForm } from "@/components/GuruResponseForm";
import { SiteFooterBlocks, SiteHeaderBlocks } from "@/components/SiteLayout";

export const dynamic = "force-dynamic";

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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  return fmtDateTime(iso);
}

function ResponseItemView({ r }: { r: PublicResponse }) {
  return (
    <div className="guru-response">
      <div className="guru-response__head">
        <div className="guru-response__avatar">{initials(r.author_name)}</div>
        <div>
          <div className="guru-response__name">{r.author_name}</div>
          <div className="guru-response__meta">
            {RESPONSE_ROLE_LABEL[r.author_role]} · {timeAgo(r.created_at)}
          </div>
        </div>
      </div>
      <div className="guru-response__body">{r.body}</div>
    </div>
  );
}

export default async function LearningMaterialDetail({
  params,
}: {
  params: { slug: string };
}) {
  const site = await getSiteByHost(host());
  if (!site) notFound();
  const detail = await getLearningMaterial(site.id, params.slug);
  if (!detail) notFound();
  const { material: m, response_count: responseCountFromApi } = detail;

  const fontHref = googleFontsUrl(site.theme);
  const html = await marked.parse(m.body_md ?? "");
  const tags = Array.isArray(m.tags) ? m.tags : [];

  // Mirror pattern dari article detail: pakai responses inline supaya
  // count + list atomic. Fallback ke fetch terpisah hanya kalau backend lama.
  const responses =
    detail.responses ?? (await listMaterialResponses(site.id, m.id, 200));
  const responseCount = detail.responses ? responses.length : responseCountFromApi;

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

      <SiteHeaderBlocks site={site} />

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

        <section className="guru-responses">
          <h2>Tanggapan ({responseCount.toLocaleString("id-ID")})</h2>
          {responses.length === 0 ? (
            <p style={{ color: "#637083", fontSize: 14 }}>
              Belum ada tanggapan. Jadilah yang pertama menulis.
            </p>
          ) : (
            responses.map((r) => <ResponseItemView key={r.id} r={r} />)
          )}
          <GuruResponseForm
            siteId={site.id}
            parent={{ kind: "material", materialId: m.id }}
          />
        </section>
      </article>

      <SiteFooterBlocks site={site} />

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
  const detail = await getLearningMaterial(site.id, params.slug);
  if (!detail) return {};
  const m = detail.material;
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
