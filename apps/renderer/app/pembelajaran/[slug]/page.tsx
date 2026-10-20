// Learning material detail — `/pembelajaran/{slug}` (spec §19.2).
// Rute static `pembelajaran` menang atas dynamic `[rubric]` (Next.js
// precedence), sehingga slug materi tidak salah-mate ke rubric handler.
//
// URL tetap flat (/pembelajaran/{slug}) — hierarki (parent/child) hanya
// mempengaruhi sidebar nav + breadcrumb + prev/next. Zero perubahan URL dari
// struktur lama → link dari WhatsApp / Google / sitemap tetap aman.

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { marked } from "@/lib/markdown";
import {
  getLearningMaterial,
  getSiteByHost,
  listLearningMaterials,
  listLearningTree,
  listMaterialResponses,
  RESPONSE_ROLE_LABEL,
  type LearningMaterial,
  type PublicResponse,
} from "@/lib/api";
import { processCallouts } from "@/lib/pembelajaran-callouts";
import { extractAndAnnotateTOC } from "@/lib/pembelajaran-toc";
import { buildBreadcrumb, wrap } from "@/lib/schema";
import { googleFontsUrl, themeToCss } from "@/lib/theme";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { SiteBodyEndCode, SiteHeadCode } from "@/components/CustomCode";
import { ArticleAudio } from "@/components/ArticleAudio";
import { GuruStyles } from "@/components/GuruBlocks";
import { GuruResponseForm } from "@/components/GuruResponseForm";
import { PembelajaranLayout } from "@/components/PembelajaranLayout";
import { PembelajaranProgress } from "@/components/PembelajaranProgress";
import { PembelajaranStyles } from "@/components/PembelajaranStyles";
import { SiteFooterBlocks, SiteHeaderBlocks } from "@/components/SiteLayout";

export const dynamic = "force-dynamic";

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

// countH2H3 — hitung jumlah heading di body MD (sebelum parse) untuk deteksi
// apakah TOC perlu ditampilkan.
function countHeadings(md: string): number {
  const matches = md.match(/^#{2,3}\s+/gm);
  return matches ? matches.length : 0;
}

// estimateReadingTime — ~200 kata/menit (bahasa Indonesia). Minimal 1 menit.
function estimateReadingTime(md: string, excerpt: string): number {
  const text = (md + " " + excerpt).replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// buildPrevNext — cari materi sibling untuk CTA bawah. Scope:
//   - Kalau current punya parent → siblings = sesama child parent itu.
//   - Kalau current top-level → siblings = sesama top-level.
// Urut by sort_order asc, created_at asc. Return [prev, next] (bisa null).
function buildPrevNext(
  current: LearningMaterial,
  all: LearningMaterial[],
): { prev: LearningMaterial | null; next: LearningMaterial | null } {
  const siblings = all
    .filter((m) => m.parent_id === current.parent_id)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });
  const idx = siblings.findIndex((m) => m.id === current.id);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
  };
}

export default async function LearningMaterialDetail(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const site = await getSiteByHost(await host());
  if (!site) notFound();
  const detail = await getLearningMaterial(site.id, params.slug);
  if (!detail) notFound();
  const { material: m, response_count: responseCountFromApi } = detail;

  // Fetch tree untuk sidebar + flat list untuk prev/next.
  // Dua call paralel — tree sudah group nested, listLearningMaterials flat.
  const [tree, flatList] = await Promise.all([
    listLearningTree(site.id),
    listLearningMaterials(site.id, 500),
  ]);

  const fontHref = googleFontsUrl(site.theme);
  const rawHtml = await marked.parse(m.body_md ?? "");
  // Callouts dulu (sebelum TOC) supaya "[!NOTE]" tidak nyasar jadi anchor H2/H3.
  const htmlWithCallouts = processCallouts(String(rawHtml));
  const { html: bodyHtml, items: tocItems } = extractAndAnnotateTOC(htmlWithCallouts);
  const tags = Array.isArray(m.tags) ? m.tags : [];
  const readingMinutes = estimateReadingTime(m.body_md ?? "", m.excerpt ?? "");

  // Adaptive layout flags — chrome muncul hanya kalau punya alasan ada.
  const totalMateri = flatList.length;
  const hasHierarchy = flatList.some((x) => x.parent_id || flatList.some((y) => y.parent_id === x.id));
  const showSidebar = totalMateri > 3 || hasHierarchy;
  const showTOC = tocItems.length >= 2;
  const showBreadcrumb = !!m.parent_id;

  // Breadcrumb data (dari DB lookup, bukan URL path).
  const parent = m.parent_id ? flatList.find((x) => x.id === m.parent_id) ?? null : null;

  // Prev/Next sibling.
  const { prev, next } = buildPrevNext(m, flatList);
  const showPrevNext = !!(prev || next);

  // Responses — mirror article detail flow (inline atau fallback fetch).
  const responses =
    detail.responses ?? (await listMaterialResponses(site.id, m.id, 200));
  const responseCount = detail.responses ? responses.length : responseCountFromApi;

  // BreadcrumbList JSON-LD untuk SERP. Build dari data (bukan URL), supaya
  // breadcrumb visual + schema konsisten.
  const baseURL = `https://${await host()}`;
  const crumbs: Array<{ name: string; url?: string }> = [
    { name: "Pembelajaran", url: `${baseURL}/pembelajaran` },
  ];
  if (parent) {
    crumbs.push({ name: parent.title, url: `${baseURL}/pembelajaran/${parent.slug}` });
  }
  crumbs.push({ name: m.title }); // current — no url

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: wrap([buildBreadcrumb(crumbs)]) }}
      />
      <GuruStyles />
      <PembelajaranStyles />
      <PembelajaranProgress />
      <SiteHeadCode site={site} />
      <PageViewBeacon
        siteId={site.id}
        pageSlug={`/pembelajaran/${params.slug}`}
      />

      <SiteHeaderBlocks site={site} />

      <PembelajaranLayout
        tree={tree}
        current={{ id: m.id, slug: m.slug, parentId: m.parent_id }}
        tocItems={tocItems}
        showSidebar={showSidebar}
        showTOC={showTOC}
      >
        {/* Breadcrumb — modern, dengan parent emoji kalau ada */}
        {showBreadcrumb && parent ? (
          <nav className="pembelajaran-breadcrumb" aria-label="Breadcrumb">
            <a href="/pembelajaran">Pembelajaran</a>
            <span className="pembelajaran-breadcrumb__sep" aria-hidden>/</span>
            <a href={`/pembelajaran/${parent.slug}`}>
              {parent.emoji && <span>{parent.emoji} </span>}
              {parent.title}
            </a>
          </nav>
        ) : (
          <nav className="pembelajaran-breadcrumb" aria-label="Breadcrumb">
            <a href="/pembelajaran">Pembelajaran</a>
          </nav>
        )}

        {/* Judul — lebih tight + modern */}
        <h1>{m.title}</h1>

        {/* Metadata chip row — tanggal + reading time + tanggapan + share */}
        <div className="pembelajaran-meta">
          {m.published_at && (
            <span className="pembelajaran-meta__chip">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M6 2v2h8V2h2v2h1a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2h1V2h2zm11 7H3v9h14V9z" />
              </svg>
              {fmtDate(m.published_at)}
            </span>
          )}
          <span className="pembelajaran-meta__chip">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 8V5H9v6l4 2.5 1-1.6-3-2V10z" />
            </svg>
            {readingMinutes} menit baca
          </span>
          {responseCount > 0 && (
            <a href="#tanggapan" className="pembelajaran-meta__chip">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M3 4a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 3V4z" />
              </svg>
              {responseCount} tanggapan
            </a>
          )}
        </div>

        {m.excerpt ? (
          <p className="pembelajaran-main__deck">{m.excerpt}</p>
        ) : null}

        {/* Cover — soft modernized */}
        {m.cover_image_url && (
          <figure className="pembelajaran-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.cover_image_url} alt={m.title} loading="lazy" />
          </figure>
        )}

        {/* ArticleAudio default selector .guru-article-detail__body — di sini
            body pakai class .pembelajaran-body, jadi override selector-nya
            supaya extractText dapat teks yang benar. */}
        <ArticleAudio title={m.title} selector=".pembelajaran-body" />

        {/* Divider halus antara metadata dan body */}
        <hr className="pembelajaran-divider" aria-hidden />

        <div
          className="pembelajaran-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {m.summary && (
          <aside className="pembelajaran-summary">
            <div className="pembelajaran-summary__label">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h9v2H3v-2z" />
              </svg>
              Ringkasan
            </div>
            <div className="pembelajaran-summary__body">{m.summary}</div>
          </aside>
        )}

        {tags.length > 0 && (
          <div className="pembelajaran-tags">
            {tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}

        {/* Prev/Next modern dengan SVG arrow yang slide on hover */}
        {showPrevNext && (
          <nav className="pembelajaran-nav" aria-label="Navigasi materi">
            {prev ? (
              <a href={`/pembelajaran/${prev.slug}`} className="pembelajaran-nav__card">
                <span className="pembelajaran-nav__arrow" aria-hidden>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 15l-5-5 5-5" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="pembelajaran-nav__body">
                  <span className="pembelajaran-nav__label">Sebelumnya</span>
                  <span className="pembelajaran-nav__title">{prev.title}</span>
                </span>
              </a>
            ) : (
              <span aria-hidden />
            )}
            {next ? (
              <a
                href={`/pembelajaran/${next.slug}`}
                className="pembelajaran-nav__card pembelajaran-nav__card--next"
              >
                <span className="pembelajaran-nav__body">
                  <span className="pembelajaran-nav__label">Berikutnya</span>
                  <span className="pembelajaran-nav__title">{next.title}</span>
                </span>
                <span className="pembelajaran-nav__arrow" aria-hidden>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 5l5 5-5 5" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </a>
            ) : (
              <span aria-hidden />
            )}
          </nav>
        )}

        <section id="tanggapan" className="pembelajaran-responses">
          <div className="pembelajaran-responses__head">
            <h2>Tanggapan</h2>
            <span className="pembelajaran-responses__count">
              {responseCount.toLocaleString("id-ID")}
            </span>
          </div>
          {responses.length === 0 ? (
            <p className="pembelajaran-responses__empty">
              Belum ada tanggapan. Jadilah yang pertama menulis.
            </p>
          ) : (
            <div className="pembelajaran-responses__list">
              {responses.map((r) => <ResponseItemView key={r.id} r={r} />)}
            </div>
          )}
          <GuruResponseForm
            siteId={site.id}
            parent={{ kind: "material", materialId: m.id }}
          />
        </section>
      </PembelajaranLayout>

      <SiteFooterBlocks site={site} />

      <SiteBodyEndCode site={site} />
    </>
  );
}

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const site = await getSiteByHost(await host());
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

// Suppress unused-var ESLint (countHeadings not currently used — kept for
// potential alternative heuristic if we ever want to split logic by MD source
// rather than HTML output).
void countHeadings;
