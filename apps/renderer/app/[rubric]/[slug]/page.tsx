// Article detail — `/{rubric}/{slug}` untuk 6 rubric guru (spec §17).
// Route lebih spesifik dari catch-all `[...slug]` sehingga menang matching.
// Rubric non-guru → notFound. CMS user tidak memakai 2-segment slug.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { marked } from "@/lib/markdown";
import {
  getArticle,
  getSiteByHost,
  isGuruRubric,
  listArticleResponses,
  GURU_RUBRIC_LABEL,
  type GuruRubric,
  type PublicResponse,
  RESPONSE_ROLE_LABEL,
} from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { SiteBodyEndCode, SiteHeadCode } from "@/components/CustomCode";
import { ArticleAudio } from "@/components/ArticleAudio";
import { GuruStyles } from "@/components/GuruBlocks";
import { GuruResponseForm } from "@/components/GuruResponseForm";
import { LiteraWidget } from "@/components/LiteraWidget";
import { SiteFooterBlocks, SiteHeaderBlocks } from "@/components/SiteLayout";
import { canonicalArticleURL } from "@/lib/canonical";

export const dynamic = "force-dynamic";

// marked config di @/lib/markdown (shared) — sudah setOptions + custom code
// renderer untuk fence `youtube`/`audio`. Import di sini side-effect free.

async function host() {
  return ((await headers()).get("host") ?? "").toLowerCase().split(":")[0];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// timeAgo — relative untuk < 24 jam ("baru saja" / "N menit lalu" / "N jam lalu");
// setelah itu switch ke tanggal+jam konkret supaya guru tahu waktu persisnya.
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
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

export default async function ArticleDetail(
  props: {
    params: Promise<{ rubric: string; slug: string }>;
  }
) {
  const params = await props.params;
  if (!isGuruRubric(params.rubric)) notFound();
  const rubric = params.rubric as GuruRubric;

  const site = await getSiteByHost(await host());
  if (!site) notFound();

  const detail = await getArticle(site.id, rubric, params.slug);
  if (!detail) notFound();
  const { article, response_count: responseCountFromApi } = detail;

  const fontHref = googleFontsUrl(site.theme);
  const html = await marked.parse(article.body_md ?? "");
  const tags = Array.isArray(article.tags) ? article.tags : [];

  // Prefer responses INLINE dari article detail response (atomic dengan count
  // — cegah mismatch "Tanggapan (2)" tapi list kosong). Fallback ke fetch
  // terpisah kalau backend lama belum expose field `responses` (rolling
  // deploy compat). Setelah semua backend up-to-date, fallback ini bisa
  // dihapus.
  const responses = article.comments_enabled
    ? detail.responses ?? (await listArticleResponses(site.id, article.id, 200))
    : [];
  // Count = length list yang benar-benar di-render (bukan dari field count
  // yang bisa desync). Kalau field responses ada, count = len(responses);
  // kalau fallback dipakai, count = responseCountFromApi (backup).
  const responseCount = detail.responses ? responses.length : responseCountFromApi;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <GuruStyles />
      <SiteHeadCode site={site} />
      <PageViewBeacon siteId={site.id} pageSlug={`/${rubric}/${params.slug}`} />

      <SiteHeaderBlocks site={site} />

      <article className="guru-article-detail">
        <div className="guru-article-detail__meta">
          <a href={`/${rubric}`}>{GURU_RUBRIC_LABEL[rubric]}</a>
          {article.published_at ? <span>{fmtDate(article.published_at)}</span> : null}
          {article.reading_time_min > 0 ? (
            <span>{article.reading_time_min} menit baca</span>
          ) : null}
        </div>

        <h1>{article.title}</h1>

        {article.excerpt ? (
          <p className="guru-article-detail__deck">{article.excerpt}</p>
        ) : null}

        <div className="guru-article-detail__stats">
          <span>{article.view_count.toLocaleString("id-ID")} views</span>
          {article.comments_enabled && (
            <span>· {responseCount.toLocaleString("id-ID")} tanggapan</span>
          )}
        </div>

        {article.cover_image_url && (
          <div className="guru-article-detail__cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.cover_image_url} alt={article.title} />
          </div>
        )}

        <ArticleAudio title={article.title} />

        <div
          className="guru-article-detail__body"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {tags.length > 0 && (
          <div className="guru-article-detail__tags">
            {tags.map((t) => (
              <a key={t} href={`/${rubric}?tag=${encodeURIComponent(t)}`}>
                #{t}
              </a>
            ))}
          </div>
        )}

        {/* Litera NFT widget — hanya tampil kalau artikel sudah terdaftar
            (litera_enabled + punya intent_id). Widget auto-handle status
            "sedang diproses" sampai admin mint di dashboard Literaa. */}
        {article.litera_enabled && article.litera_intent_id && (
          <LiteraWidget
            canonicalURL={canonicalArticleURL(await host(), rubric, article.slug)}
          />
        )}

        {article.comments_enabled && (
          <section className="guru-responses">
            <h2>Tanggapan ({responseCount.toLocaleString("id-ID")})</h2>
            {responses.length === 0 ? (
              <p style={{ color: "#637083", fontSize: 14 }}>
                Belum ada tanggapan. Jadilah yang pertama menulis.
              </p>
            ) : (
              responses.map((r) => <ResponseItemView key={r.id} r={r} />)
            )}
            <GuruResponseForm siteId={site.id} articleId={article.id} />
          </section>
        )}
      </article>

      <SiteFooterBlocks site={site} />

      <SiteBodyEndCode site={site} />
    </>
  );
}

export async function generateMetadata(
  props: {
    params: Promise<{ rubric: string; slug: string }>;
  }
) {
  const params = await props.params;
  if (!isGuruRubric(params.rubric)) return {};
  const rubric = params.rubric as GuruRubric;
  const site = await getSiteByHost(await host());
  if (!site) return {};
  const detail = await getArticle(site.id, rubric, params.slug);
  if (!detail) return {};
  const a = detail.article;
  const title = a.seo_title || `${a.title} — ${site.name}`;
  const description = a.seo_description || a.excerpt || "";
  return {
    title,
    description,
    openGraph: a.cover_image_url
      ? { title, description, images: [{ url: a.cover_image_url }] }
      : { title, description },
  };
}
