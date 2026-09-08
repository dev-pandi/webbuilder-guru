"use client";

import { useState } from "react";

// IsiWebsitePreview — interactive preview 6 tab (Ceritaku / Bacaanku /
// Inspirasiku / Bangsaku / Peradaban / Forum Diskusi). User klik tab →
// browser URL + kicker + title + description + article preview berubah.
// Static SSR-friendly: initial tab = ceritaku render tanpa JS.

type TabKey =
  | "ceritaku"
  | "bacaanku"
  | "inspirasiku"
  | "bangsaku"
  | "peradaban"
  | "forum";

const CONTENT: Record<
  TabKey,
  {
    label: string;
    slug: string;
    title: string;
    desc: string;
    articleTitle: string;
    articleText: string;
    coverGrad: string;
  }
> = {
  ceritaku: {
    label: "Ceritaku",
    slug: "ceritaku",
    title: "Hati-hati dengan spasi.",
    desc: "Cerita kecil dari keseharian kelas bisa menjadi pintu masuk untuk menjelaskan hal yang bermakna — dari pengalaman, nilai kehidupan, hingga bidang yang diajarkan.",
    articleTitle: "Catatan dari kelas hari ini",
    articleText:
      "Sebuah kesalahan sederhana saat menulis justru membuka percakapan tentang ketelitian, konteks, dan cara kita memahami pesan.",
    coverGrad: "linear-gradient(135deg,#dbe8f0 0%,#f4e7da 55%,#ead8d5 100%)",
  },
  bacaanku: {
    label: "Bacaanku",
    slug: "bacaanku",
    title: "Membaca Laskar Pelangi dari sudut guru.",
    desc: "Buku yang saya baca dan bawa ke ruang kelas — bagian mana yang membuat siswa tertahan, bagian mana yang mereka lewati begitu saja.",
    articleTitle: "Ulasan bacaan",
    articleText:
      "Ada halaman yang berubah maknanya ketika dibaca dari sisi orang dewasa yang setiap hari berdiri di depan kelas.",
    coverGrad: "linear-gradient(135deg,#f1deda 0%,#e7edf3 55%,#dbe8f0 100%)",
  },
  inspirasiku: {
    label: "Inspirasiku",
    slug: "inspirasiku",
    title: "Kelas kecil, perubahan besar.",
    desc: "Praktik baik, ide sederhana, dan orang-orang yang menyalakan semangat mengajar. Kadang inspirasi datang dari percakapan singkat di ruang guru.",
    articleTitle: "Cerita dari guru desa",
    articleText:
      "Bermodal satu rak buku dan konsistensi, guru desa yang saya jumpai mengubah cara siswa memandang bacaan sepanjang semester.",
    coverGrad: "linear-gradient(135deg,#dce8df 0%,#f2eadb 55%,#efe1cf 100%)",
  },
  bangsaku: {
    label: "Bangsaku",
    slug: "bangsaku",
    title: "Gotong royong yang bukan slogan.",
    desc: "Belajar Indonesia lewat gotong royong, keberagaman, tanggung jawab, keadilan, dan bahasa yang merangkul.",
    articleTitle: "Contoh dari kelas",
    articleText:
      "Pembagian tugas yang adil membuat proyek kelompok terasa milik semua orang — bukan hanya milik satu-dua siswa yang paling aktif.",
    coverGrad: "linear-gradient(135deg,#f7e7c3 0%,#f4d9dc 55%,#e0ebf3 100%)",
  },
  peradaban: {
    label: "Peradaban",
    slug: "peradaban",
    title: "Jejak aksara Nusantara.",
    desc: "Membaca sejarah, budaya, dan warisan sebagai percakapan antargenerasi. Bagaimana pelajaran hari ini terhubung dengan jejak yang sudah lama ditinggalkan.",
    articleTitle: "Aksara sebagai ingatan",
    articleText:
      "Aksara bukan sekadar simbol di halaman buku sejarah — ia adalah ingatan yang hidup dan tetap dipakai lintas generasi.",
    coverGrad: "linear-gradient(135deg,#eae0cf 0%,#e7dfd0 55%,#d9e6f0 100%)",
  },
  forum: {
    label: "Forum Diskusi",
    slug: "forum-diskusi",
    title: "Apakah PR masih relevan?",
    desc: "Ruang guru, siswa, orang tua, dan pembaca untuk membicarakan materi, pengalaman, dan isu aktual — dengan prinsip moderasi.",
    articleTitle: "Pertanyaan dari pembaca",
    articleText:
      "Daripada bertanya perlu atau tidak, mari membahas: untuk siapa, untuk tujuan apa, dan dalam kondisi apa PR diberikan.",
    coverGrad: "linear-gradient(135deg,#dfeaf1 0%,#e5edf3 55%,#f4dedb 100%)",
  },
};

const TABS: TabKey[] = [
  "ceritaku",
  "bacaanku",
  "inspirasiku",
  "bangsaku",
  "peradaban",
  "forum",
];

export function IsiWebsitePreview() {
  const [active, setActive] = useState<TabKey>("ceritaku");
  const c = CONTENT[active];

  return (
    <div className="overflow-hidden rounded-[24px] border border-[#e6e9ef] bg-white shadow-[0_24px_60px_rgba(24,34,53,.10)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 border-b border-[#e6e9ef] bg-[#f8f9fb] px-4 py-3.5">
        <span className="size-2.5 rounded-full bg-[#d5d9e1]" />
        <span className="size-2.5 rounded-full bg-[#d5d9e1]" />
        <span className="size-2.5 rounded-full bg-[#d5d9e1]" />
        <div className="ml-2 flex-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-[#7a8495] transition-all">
          gururatna.id/{c.slug}
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        {/* Sidebar with tabs */}
        <aside className="border-b border-[#e6e9ef] bg-[#fbfaf7] p-5 md:border-b-0 md:border-r">
          <div className="mb-5 flex items-center gap-3">
            <div className="size-11 shrink-0 rounded-2xl bg-gradient-to-br from-[#eaf2fb] to-[#fce9ea]" />
            <div className="min-w-0">
              <div className="text-sm font-extrabold leading-tight text-[#172033]">
                Bu Ratna
              </div>
              <div className="text-[10px] leading-tight text-[#637083]">
                Guru Bahasa Indonesia · fiktif
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 md:flex-col">
            {TABS.map((k) => {
              const isActive = k === active;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActive(k)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-bold transition-all ${
                    isActive
                      ? "bg-[#172033] text-white shadow-[0_10px_24px_rgba(23,32,51,.18)]"
                      : "text-[#4c5b70] hover:bg-white hover:text-[#172033]"
                  }`}
                >
                  {CONTENT[k].label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <div className="p-6 md:p-8" aria-live="polite">
          <div className="text-[11px] font-extrabold uppercase tracking-[.13em] text-[#d73f45]">
            {c.label}
          </div>
          <h3
            className="mt-2 text-2xl font-extrabold leading-tight tracking-tight text-[#172033] sm:text-3xl"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {c.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-[#637083] sm:text-base">
            {c.desc}
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-[1.15fr_.85fr]">
            <article className="rounded-2xl border border-[#e6e9ef] bg-[#fbfaf7] p-5">
              <h4 className="text-base font-extrabold text-[#172033]">
                {c.articleTitle}
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-[#637083]">
                {c.articleText}
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-[#637083]">
                <span>1.248 views</span>
                <span>·</span>
                <span>18 tanggapan</span>
              </div>
            </article>
            <div
              className="relative min-h-[180px] overflow-hidden rounded-2xl transition-all duration-500"
              style={{ background: c.coverGrad }}
              aria-hidden
            >
              <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/50" />
              <div className="absolute bottom-6 left-6 size-14 rounded-full bg-white/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
