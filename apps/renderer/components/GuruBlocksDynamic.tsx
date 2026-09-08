// GuruBlocksDynamic — server-component wrappers untuk block Guru yang fetch
// data dari API pada render time. Semua menerima `siteId` yang di-inject oleh
// dispatch di Blocks.tsx (bukan dari block.props — supaya user tidak bisa
// spoof site lain lewat editor).

import {
  GURU_RUBRIC_LABEL,
  isGuruRubric,
  listArticles,
  listLatestArticles,
  listLearningMaterials,
  listPromotionBanners,
  getSiteStats,
  type Article,
  type ArticleListItem,
  type GuruRubric,
} from "@/lib/api";
import {
  GuruArticleGrid,
  GuruForumThreadList,
  GuruLatestGrid,
  GuruPromoCarousel,
  GuruStatsBar,
} from "./GuruBlocks";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function engagement(a: { view_count: number; response_count?: number; comments_enabled?: boolean }) {
  const views = `${a.view_count.toLocaleString("id-ID")} views`;
  if (!a.comments_enabled) return views;
  if (typeof a.response_count === "number") {
    return `${views} · ${a.response_count} tanggapan`;
  }
  return views;
}

function coverVariant(rubric: GuruRubric): "default" | "red" | "sage" | "gold" {
  // Match colored covers di GuruBlocks: rotate biar konsisten dengan design.
  switch (rubric) {
    case "ceritaku":
      return "red";
    case "bacaanku":
      return "default";
    case "inspirasiku":
      return "gold";
    case "bangsaku":
      return "sage";
    case "peradaban":
      return "default";
    case "forum-diskusi":
      return "red";
  }
}

// GuruPromoCarouselDynamic — fetch banner efektif untuk site, render carousel
// existing. Kalau kosong → tidak render section (per spec §42 empty state).
export async function GuruPromoCarouselDynamic({ siteId }: { siteId: string }) {
  const banners = await listPromotionBanners(siteId);
  if (banners.length === 0) return null;
  const items = banners.map((b) => ({
    image: b.image_url,
    alt: b.alt_text,
    href: b.target_url,
  }));
  return <GuruPromoCarousel items={items} />;
}

// GuruStatsBarDynamic — "Jejak Website Saya" section (spec §12).
// 3 stat: Total Views, Tanggapan, Tulisan.
export async function GuruStatsBarDynamic({
  siteId,
  eyebrow,
  title,
  subtitle,
}: {
  siteId: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}) {
  const stats = await getSiteStats(siteId);
  const s = stats ?? { total_views: 0, total_responses: 0, total_articles: 0 };
  return (
    <GuruStatsBar
      eyebrow={eyebrow ?? "Jejak Website Saya"}
      title={title}
      subtitle={subtitle}
      items={[
        { value: s.total_views.toLocaleString("id-ID"), label: "Total Views" },
        { value: s.total_responses.toLocaleString("id-ID"), label: "Tanggapan" },
        { value: s.total_articles.toLocaleString("id-ID"), label: "Tulisan" },
      ]}
    />
  );
}

// GuruLatestGridDynamic — Beranda "Tulisan Terbaru" section (spec §9.6).
// Featured = artikel terbaru pertama, side = 3 berikutnya.
export async function GuruLatestGridDynamic({
  siteId,
  eyebrow,
  title,
  subtitle,
}: {
  siteId: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}) {
  const latest = await listLatestArticles(siteId, 4);
  if (latest.length === 0) return null;

  const toItem = (a: Article) => ({
    meta: `${GURU_RUBRIC_LABEL[a.rubric]}${a.published_at ? " · " + fmtDate(a.published_at) : ""}`,
    title: a.title,
    excerpt: a.excerpt,
    href: `/${a.rubric}/${a.slug}`,
    engagement: engagement({
      view_count: a.view_count,
      comments_enabled: a.comments_enabled,
    }),
  });

  const [featuredArt, ...rest] = latest;
  return (
    <GuruLatestGrid
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      featured={toItem(featuredArt)}
      side={rest.slice(0, 3).map(toItem)}
    />
  );
}

// GuruArticleGridDynamic — halaman rubrik listing (spec §14). Reads rubric
// dari block.props supaya template bisa reuse block per rubric page.
export async function GuruArticleGridDynamic({
  siteId,
  rubric,
  sidebarTitle,
  sidebarBody,
  sidebarTags,
  sidebarLinks,
}: {
  siteId: string;
  rubric: string;
  sidebarTitle?: string;
  sidebarBody?: string;
  sidebarTags?: string[];
  sidebarLinks?: Array<{ label: string; href: string }>;
}) {
  if (!isGuruRubric(rubric)) return null;
  const articles = await listArticles(siteId, rubric, 20);
  if (articles.length === 0) {
    return (
      <section className="guru-section">
        <div className="guru-container">
          <div className="guru-content-panel">
            <p style={{ color: "#637083", textAlign: "center", padding: "40px 20px" }}>
              Belum ada tulisan di rubrik {GURU_RUBRIC_LABEL[rubric]}.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const items = articles.map((a: ArticleListItem, i: number) => ({
    title: a.title,
    excerpt: a.excerpt,
    meta: a.published_at ? fmtDate(a.published_at) : "",
    href: `/${a.rubric}/${a.slug}`,
    engagement: engagement(a),
    coverVariant: coverVariant(a.rubric),
    featured: i === 0,
  }));
  return (
    <GuruArticleGrid
      items={items}
      sidebarTitle={sidebarTitle}
      sidebarBody={sidebarBody}
      sidebarTags={sidebarTags}
      sidebarLinks={sidebarLinks}
    />
  );
}

// GuruLearningGridDynamic — halaman Pembelajaran (spec §19). Reuse
// GuruArticleGrid UI, tanpa engagement meta (materi tidak punya views/
// tanggapan sesuai spec).
export async function GuruLearningGridDynamic({
  siteId,
  sidebarTitle,
  sidebarBody,
  sidebarTags,
  sidebarLinks,
}: {
  siteId: string;
  sidebarTitle?: string;
  sidebarBody?: string;
  sidebarTags?: string[];
  sidebarLinks?: Array<{ label: string; href: string }>;
}) {
  const materials = await listLearningMaterials(siteId, 20);
  if (materials.length === 0) {
    return (
      <section className="guru-section">
        <div className="guru-container">
          <div className="guru-content-panel">
            <p style={{ color: "#637083", textAlign: "center", padding: "40px 20px" }}>
              Belum ada materi pembelajaran.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const variants: Array<"default" | "red" | "sage" | "gold"> = [
    "default", "red", "sage", "gold",
  ];
  const items = materials.map((m, i) => ({
    title: m.title,
    excerpt: m.excerpt,
    meta: m.published_at ? `Pembelajaran · ${fmtDate(m.published_at)}` : "Pembelajaran",
    href: `/pembelajaran/${m.slug}`,
    coverVariant: variants[i % variants.length],
    featured: i === 0,
  }));
  return (
    <GuruArticleGrid
      items={items}
      sidebarTitle={sidebarTitle}
      sidebarBody={sidebarBody}
      sidebarTags={sidebarTags}
      sidebarLinks={sidebarLinks}
    />
  );
}

// GuruForumThreadListDynamic — halaman Forum Diskusi (spec §16).
// Reuse GuruForumThreadList UI dengan data dari articles rubric=forum-diskusi.
export async function GuruForumThreadListDynamic({
  siteId,
  moderationNote,
  participants,
  sidebarLinks,
}: {
  siteId: string;
  moderationNote?: { badge: string; title: string; body: string };
  participants?: string[];
  sidebarLinks?: Array<{ label: string; href: string }>;
}) {
  const articles = await listArticles(siteId, "forum-diskusi", 20);
  if (articles.length === 0) {
    return (
      <section className="guru-section">
        <div className="guru-container">
          <div className="guru-content-panel">
            <p style={{ color: "#637083", textAlign: "center", padding: "40px 20px" }}>
              Belum ada topik di Forum Diskusi.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const avatarVariants: Array<"red" | "blue" | "sage" | "gold"> = [
    "red", "blue", "sage", "gold",
  ];
  const items = articles.map((a, i) => ({
    initials: a.title.slice(0, 1).toUpperCase(),
    avatarVariant: avatarVariants[i % avatarVariants.length],
    label: "Forum",
    date: fmtDate(a.published_at),
    title: a.title,
    excerpt: a.excerpt,
    tags: Array.isArray(a.tags) ? a.tags : [],
    engagement: engagement(a),
    featured: i === 0,
    href: `/${a.rubric}/${a.slug}`,
  }));
  return (
    <GuruForumThreadList
      items={items}
      moderationNote={moderationNote}
      participants={participants}
      sidebarLinks={sidebarLinks}
    />
  );
}
