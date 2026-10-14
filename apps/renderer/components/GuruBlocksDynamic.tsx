// GuruBlocksDynamic — server-component wrappers untuk block Guru yang fetch
// data dari API pada render time. Semua menerima `siteId` yang di-inject oleh
// dispatch di Blocks.tsx (bukan dari block.props — supaya user tidak bisa
// spoof site lain lewat editor).
//
// Template preview mode: dispatch pass `siteId="_template"` saat render
// halaman /template-preview/:slug. Di mode ini semua fetch di-skip dan
// dynamic blocks pakai SAMPLE DATA yang identik dengan yang di-seed
// backend (apps/api/internal/templates/seed_guru.go). Ini penting supaya
// pengunjung template preview lihat visual lengkap seperti site guru yang
// sudah berjalan — bukan section kosong / null.

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

// Sentinel yang dipakai renderer template preview page (bukan UUID valid).
// Kalau match → skip API + pakai sample data.
const TEMPLATE_PREVIEW_SITE = "_template";
function isTemplatePreview(siteId: string): boolean {
  return siteId === TEMPLATE_PREVIEW_SITE;
}

// ---------- Sample data (mirror seed_guru.go di backend) ----------
// Kalau backend seed berubah, sync file ini supaya template preview tetap
// konsisten dengan pengalaman guru pertama kali buka site mereka.

const SAMPLE_BANNERS = [
  { image: "/templates/guru-pandi-upi/promo-pelatihan-guru.png",
    alt: "Program pelatihan pengembangan guru",
    href: "#" },
  { image: "/templates/guru-pandi-upi/promo-literasi-kelas.png",
    alt: "Program literasi kelas",
    href: "#" },
  { image: "/templates/guru-pandi-upi/promo-komunitas-guru.png",
    alt: "Komunitas berbagi praktik baik guru",
    href: "#" },
];

const SAMPLE_STATS = {
  total_views: 42680,
  total_responses: 324,
  total_articles: 186,
};

const SAMPLE_LATEST: Array<{ rubric: GuruRubric; slug: string; title: string; excerpt: string; view_count: number; response_count: number; comments_enabled: boolean; published_at: string }> = [
  { rubric: "ceritaku", slug: "hati-hati-dengan-spasi",
    title: "Hati-hati dengan Spasi",
    excerpt: "Berawal dari kesalahan kecil pada sebuah kalimat, kelas Bahasa Indonesia berubah menjadi percakapan tentang makna.",
    view_count: 1248, response_count: 18, comments_enabled: true,
    published_at: "2026-09-02T00:00:00Z" },
  { rubric: "peradaban", slug: "jejak-aksara-nusantara",
    title: "Jejak Aksara dalam Perjalanan Nusantara",
    excerpt: "Membaca aksara sebagai ingatan yang hidup.",
    view_count: 2136, response_count: 27, comments_enabled: true,
    published_at: "2026-09-01T00:00:00Z" },
  { rubric: "bacaanku", slug: "membaca-lagi-laskar-pelangi",
    title: "Membaca Lagi Laskar Pelangi",
    excerpt: "Apa yang berubah ketika dibaca dari sudut pandang guru?",
    view_count: 972, response_count: 12, comments_enabled: true,
    published_at: "2026-08-30T00:00:00Z" },
  { rubric: "forum-diskusi", slug: "apakah-pr-masih-relevan",
    title: "Apakah PR Masih Relevan?",
    excerpt: "Satu pertanyaan lama yang perlu konteks baru.",
    view_count: 862, response_count: 27, comments_enabled: true,
    published_at: "2026-08-28T00:00:00Z" },
];

// Sample artikel per rubric — 4 kartu, 1 featured. Content ringkas untuk preview.
const SAMPLE_ARTICLES_BY_RUBRIC: Record<GuruRubric, Array<{ title: string; excerpt: string; view_count: number; response_count: number; comments_enabled: boolean; published_at: string }>> = {
  "ceritaku": [
    { title: "Hati-hati dengan Spasi", excerpt: "Sebuah spasi yang salah menjadi pintu masuk untuk membicarakan ketelitian dan cara membaca.", view_count: 1248, response_count: 18, comments_enabled: true, published_at: "2026-09-02T00:00:00Z" },
    { title: "Ketika Siswa Menemukan Makna dalam Cerpen", excerpt: "Dari jawaban yang berbeda-beda, kami belajar bahwa membaca bukan sekadar mencari jawaban benar.", view_count: 734, response_count: 11, comments_enabled: true, published_at: "2026-09-03T00:00:00Z" },
    { title: "Belajar Menulis Pembuka yang Tidak Membosankan", excerpt: "Latihan lima menit yang membuka kelas dengan kalimat pertama yang menarik.", view_count: 512, response_count: 8, comments_enabled: true, published_at: "2026-09-04T00:00:00Z" },
    { title: "Dari Salah Tanda Baca Jadi Obrolan Bermakna", excerpt: "Kesalahan di papan tulis membuka percakapan tentang jeda dan maksud penulis.", view_count: 389, response_count: 6, comments_enabled: true, published_at: "2026-09-05T00:00:00Z" },
  ],
  "bacaanku": [
    { title: "Membaca Lagi Laskar Pelangi", excerpt: "Apa yang berubah ketika buku ini dibaca dari sudut pandang guru?", view_count: 972, response_count: 12, comments_enabled: true, published_at: "2026-09-02T00:00:00Z" },
    { title: "Chairil Anwar dan Kata yang Tidak Sopan", excerpt: "Kelas puisi bisa dimulai dari satu kata yang mengejutkan.", view_count: 641, response_count: 9, comments_enabled: true, published_at: "2026-09-03T00:00:00Z" },
    { title: "Bumi Manusia sebagai Bacaan Bersama", excerpt: "Cara memilih bab yang bisa memantik diskusi di kelas SMP.", view_count: 512, response_count: 7, comments_enabled: true, published_at: "2026-09-04T00:00:00Z" },
    { title: "Buku Kecil, Ide Besar", excerpt: "Tiga buku tipis yang memberi saya cara baru menjelaskan hal sederhana.", view_count: 378, response_count: 5, comments_enabled: true, published_at: "2026-09-05T00:00:00Z" },
  ],
  "inspirasiku": [
    { title: "Kelas Kecil, Perubahan Besar", excerpt: "Cerita guru desa mengubah cara siswa memandang buku dengan satu rak konsisten.", view_count: 856, response_count: 14, comments_enabled: true, published_at: "2026-09-02T00:00:00Z" },
    { title: "Rutinitas Membaca yang Sederhana", excerpt: "15 menit sebelum pelajaran — bagaimana kebiasaan kecil mengubah suasana kelas.", view_count: 623, response_count: 9, comments_enabled: true, published_at: "2026-09-03T00:00:00Z" },
    { title: "Guru sebagai Pembelajar", excerpt: "Refleksi dari lokakarya: yang paling berharga adalah cara berbicara antarguru.", view_count: 475, response_count: 6, comments_enabled: true, published_at: "2026-09-04T00:00:00Z" },
    { title: "Satu Pertanyaan yang Mengubah Kelas", excerpt: "Kadang cukup satu pertanyaan untuk membuat siswa berpikir.", view_count: 312, response_count: 4, comments_enabled: true, published_at: "2026-09-05T00:00:00Z" },
  ],
  "bangsaku": [
    { title: "Gotong Royong yang Bukan Slogan", excerpt: "Contoh dari kelas: pembagian tugas adil membuat proyek terasa milik semua.", view_count: 692, response_count: 11, comments_enabled: true, published_at: "2026-09-02T00:00:00Z" },
    { title: "Berbeda Tetap Bertetangga", excerpt: "Diskusi keberagaman dari cerita siswa tentang tetangga, bukan buku teks.", view_count: 534, response_count: 8, comments_enabled: true, published_at: "2026-09-03T00:00:00Z" },
    { title: "Bahasa yang Merangkul", excerpt: "Pilihan kata dalam percakapan sehari-hari mencerminkan cara memperlakukan orang lain.", view_count: 401, response_count: 6, comments_enabled: true, published_at: "2026-09-04T00:00:00Z" },
    { title: "Tanggung Jawab yang Bisa Dilatih", excerpt: "Tanggung jawab lahir dari kebiasaan kecil yang konsisten dijalankan.", view_count: 287, response_count: 4, comments_enabled: true, published_at: "2026-09-05T00:00:00Z" },
  ],
  "peradaban": [
    { title: "Jejak Aksara dalam Perjalanan Nusantara", excerpt: "Membaca aksara sebagai ingatan yang hidup — bukan sekadar simbol.", view_count: 2136, response_count: 27, comments_enabled: true, published_at: "2026-09-02T00:00:00Z" },
    { title: "Cerita Rakyat sebagai Bahan Ajar", excerpt: "Bagaimana dongeng lama tetap relevan untuk tema-tema besar di kelas SMP.", view_count: 892, response_count: 13, comments_enabled: true, published_at: "2026-09-03T00:00:00Z" },
    { title: "Warisan yang Tidak Selalu Terlihat", excerpt: "Bahasa daerah, kebiasaan makan, cara menyapa — warisan dalam bentuk sehari-hari.", view_count: 654, response_count: 8, comments_enabled: true, published_at: "2026-09-04T00:00:00Z" },
    { title: "Membaca Museum sebagai Guru", excerpt: "Kunjungan museum berubah dari tugas menjadi obrolan tentang cara menyimpan ingatan.", view_count: 421, response_count: 5, comments_enabled: true, published_at: "2026-09-05T00:00:00Z" },
  ],
  "forum-diskusi": [
    { title: "Apakah PR Masih Relevan?", excerpt: "Untuk siapa, untuk tujuan apa, dan dalam kondisi apa PR diberikan.", view_count: 862, response_count: 27, comments_enabled: true, published_at: "2026-09-02T00:00:00Z" },
    { title: "Bagaimana Menumbuhkan Budaya Membaca?", excerpt: "Apakah yang paling dibutuhkan adalah koleksi buku, waktu, atau teladan?", view_count: 1095, response_count: 24, comments_enabled: true, published_at: "2026-09-03T00:00:00Z" },
    { title: "AI di Kelas: Membantu atau Bergantung?", excerpt: "Membedakan penggunaan AI sebagai alat bantu vs menghilangkan proses belajar.", view_count: 644, response_count: 16, comments_enabled: true, published_at: "2026-09-04T00:00:00Z" },
    { title: "Apa yang Membuat Siswa Berani Berpendapat?", excerpt: "Rasa aman dan budaya kelas mungkin sama pentingnya dengan keberanian personal.", view_count: 391, response_count: 10, comments_enabled: true, published_at: "2026-09-05T00:00:00Z" },
  ],
};

const SAMPLE_MATERIALS = [
  { slug: "mengenal-teks-cerpen", title: "Mengenal Teks Cerpen",
    excerpt: "Mengenali unsur, struktur, dan cara membaca cerpen agar menangkap makna di balik cerita.",
    published_at: "2026-09-08T00:00:00Z" },
  { slug: "menyusun-teks-eksposisi", title: "Menyusun Teks Eksposisi",
    excerpt: "Memahami bagaimana gagasan, alasan, dan fakta disusun menjadi tulisan yang jelas.",
    published_at: "2026-09-07T00:00:00Z" },
  { slug: "memahami-teks-deskripsi", title: "Memahami Teks Deskripsi",
    excerpt: "Belajar memilih detail dan kata yang tepat agar pembaca bisa membayangkan.",
    published_at: "2026-09-06T00:00:00Z" },
  { slug: "menyunting-kalimat-dan-ejaan", title: "Menyunting Kalimat dan Ejaan",
    excerpt: "Latihan sederhana untuk memperbaiki pilihan kata, tanda baca, dan susunan kalimat.",
    published_at: "2026-09-05T00:00:00Z" },
];

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
// Template preview mode → SAMPLE_BANNERS (3 banner mockup).
export async function GuruPromoCarouselDynamic({ siteId }: { siteId: string }) {
  if (isTemplatePreview(siteId)) {
    return <GuruPromoCarousel items={SAMPLE_BANNERS} />;
  }
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
  const stats = isTemplatePreview(siteId)
    ? SAMPLE_STATS
    : await getSiteStats(siteId);
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
  // Template preview → 4 sample tulisan (mirror seed).
  if (isTemplatePreview(siteId)) {
    const [featured, ...rest] = SAMPLE_LATEST;
    const toSample = (s: (typeof SAMPLE_LATEST)[number]) => ({
      meta: `${GURU_RUBRIC_LABEL[s.rubric]} · ${fmtDate(s.published_at)}`,
      title: s.title,
      excerpt: s.excerpt,
      href: `/${s.rubric}/${s.slug}`,
      engagement: `${s.view_count.toLocaleString("id-ID")} views · ${s.response_count} tanggapan`,
    });
    return (
      <GuruLatestGrid
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        featured={toSample(featured)}
        side={rest.slice(0, 3).map(toSample)}
      />
    );
  }

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

  // Template preview → sample 4 artikel per rubric (mirror seed).
  if (isTemplatePreview(siteId)) {
    const samples = SAMPLE_ARTICLES_BY_RUBRIC[rubric] ?? [];
    const previewItems = samples.map((s, i) => ({
      title: s.title,
      excerpt: s.excerpt,
      meta: fmtDate(s.published_at),
      href: `#`,
      engagement: `${s.view_count.toLocaleString("id-ID")} views · ${s.response_count} tanggapan`,
      coverVariant: coverVariant(rubric),
      featured: i === 0,
    }));
    return (
      <GuruArticleGrid
        items={previewItems}
        sidebarTitle={sidebarTitle}
        sidebarBody={sidebarBody}
        sidebarTags={sidebarTags}
        sidebarLinks={sidebarLinks}
      />
    );
  }

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
    // Kalau artikel punya cover image → render photo, bukan gradient.
    // Guru tanpa cover tetap dapat colored gradient (coverVariant fallback).
    coverImage: a.cover_image_url || undefined,
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
  const variantsPreview: Array<"default" | "red" | "sage" | "gold"> = [
    "default", "red", "sage", "gold",
  ];
  // Template preview → sample 4 materi (mirror seed).
  if (isTemplatePreview(siteId)) {
    const previewItems = SAMPLE_MATERIALS.map((m, i) => ({
      title: m.title,
      excerpt: m.excerpt,
      meta: `Pembelajaran · ${fmtDate(m.published_at)}`,
      href: "#",
      coverVariant: variantsPreview[i % variantsPreview.length],
      featured: i === 0,
    }));
    return (
      <GuruArticleGrid
        items={previewItems}
        // Pembelajaran = materi, bukan artikel — CTA label harus "Lihat materi".
        ctaLabel="Lihat materi →"
        sidebarTitle={sidebarTitle}
        sidebarBody={sidebarBody}
        sidebarTags={sidebarTags}
        sidebarLinks={sidebarLinks}
      />
    );
  }

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
    coverImage: m.cover_image_url || undefined,
    featured: i === 0,
  }));
  return (
    <GuruArticleGrid
      items={items}
      // Pembelajaran = materi, bukan artikel — CTA label harus "Lihat materi".
      ctaLabel="Lihat materi →"
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
  const avatarVariantsPreview: Array<"red" | "blue" | "sage" | "gold"> = [
    "red", "blue", "sage", "gold",
  ];
  // Template preview → sample forum thread dari SAMPLE_ARTICLES_BY_RUBRIC.
  if (isTemplatePreview(siteId)) {
    const forum = SAMPLE_ARTICLES_BY_RUBRIC["forum-diskusi"] ?? [];
    const previewItems = forum.map((a, i) => ({
      initials: a.title.slice(0, 1).toUpperCase(),
      avatarVariant: avatarVariantsPreview[i % avatarVariantsPreview.length],
      label: "Forum",
      date: fmtDate(a.published_at),
      title: a.title,
      excerpt: a.excerpt,
      tags: [] as string[],
      engagement: `${a.view_count.toLocaleString("id-ID")} views · ${a.response_count} tanggapan`,
      featured: i === 0,
      href: "#",
    }));
    return (
      <GuruForumThreadList
        items={previewItems}
        moderationNote={moderationNote}
        participants={participants}
        sidebarLinks={sidebarLinks}
      />
    );
  }

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
