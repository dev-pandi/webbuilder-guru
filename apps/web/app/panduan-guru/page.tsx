// /panduan-guru — Landing panduan lengkap untuk guru. Konten di-render
// dari markdown source di docs/user-guide/ supaya edit sekali → live di
// web + PDF (via generate-pdf-guru.sh). SEO friendly + mobile-native +
// deep-linkable ke section (hash anchors).
//
// PDF tetap tersedia untuk offline/print via /panduan-rumah-digital-guru.pdf

import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ArrowLeft, Download, GraduationCap, Search } from "lucide-react";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { PanduanBackToTop } from "./BackToTop";
import { PanduanLightbox } from "./Lightbox";

export const metadata = {
  title: "Panduan Rumah Digital Guru — Cara Memulai",
  description:
    "Panduan lengkap membuat website pribadi guru dengan platform PANDI × UPI: daftar, beli domain, susun konten, publikasi.",
};

// Load markdown source at build time (server component). Membaca 2 bab:
// 00-pengantar-guru + 60-panduan-client-guru. Concat sebagai satu halaman
// dengan anchor per H2 supaya table-of-contents bisa deep-link.
//
// Rewrite path `screenshots/xxx.png` → `/panduan-screenshots/xxx.png` supaya
// Next.js public folder (symlinked ke docs/user-guide/screenshots) serve
// PNG-nya. Tanpa rewrite, browser cari image relatif dari /panduan-guru →
// 404 semua.
function loadPanduanMarkdown(): string {
  const docsDir = path.join(process.cwd(), "..", "..", "docs", "user-guide");
  const files = ["00-pengantar-guru.md", "60-panduan-client-guru.md"];
  const parts = files.map((f) => {
    try {
      return fs.readFileSync(path.join(docsDir, f), "utf-8");
    } catch {
      return `<!-- File ${f} tidak ditemukan -->`;
    }
  });
  const joined = parts.join("\n\n---\n\n");
  // Rewrite semua image reference dari relatif → absolute /panduan-screenshots/
  return joined.replace(/(!\[[^\]]*\]\()screenshots\//g, "$1/panduan-screenshots/");
}

// slugifyHeading — konsisten antara TOC + heading render.
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Marked config — simple + safe. Auto-generate ID untuk H2 supaya deep-link
// via hash bisa jalan (#daftar-akun, #beli-domain, dst).
//
// WAJIB `useNewRenderer: true` — tanpa flag ini, marked panggil renderer
// dengan positional signature lama `(text, level, raw)` → `tokens` undefined
// → error "Cannot read properties of undefined (reading 'length')".
marked.setOptions({ gfm: true, breaks: false });
marked.use({
  useNewRenderer: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plainText = tokens
        .filter((t) => "text" in t)
        .map((t) => ("text" in t ? t.text : ""))
        .join("");
      return `<h${depth} id="${slugifyHeading(plainText)}">${text}</h${depth}>`;
    },
    // Image renderer — 4 optimasi:
    //   1. `loading="lazy"` — defer off-viewport image (browser native)
    //   2. `decoding="async"` — parallel decode, tidak block main thread
    //   3. `data-panduan-img` — hook untuk PanduanLightbox client component
    //      (click-to-zoom modal, load full res on demand)
    //   4. `fetchpriority="low"` — dorong ke bawah antrian network supaya
    //      resource critical (JS, CSS, first-fold image) prioritas lebih tinggi
    // Wrap dengan <figure> supaya caption + placeholder space reserved via
    // CSS `aspect-ratio: 16/9` (prevent CLS walaupun tinggi image belum di-load).
    image({ href, title, text }) {
      const alt = text ?? "";
      const titleAttr = title ? ` title="${title}"` : "";
      return `<figure class="panduan-figure"><img src="${href}" alt="${alt}"${titleAttr} loading="lazy" decoding="async" fetchpriority="low" data-panduan-img /></figure>`;
    },
  },
});

// extractTOC — parse markdown untuk ambil H2 (bab utama) → daftar {id, title}
// untuk TOC sidebar. Skip H1 (judul bab besar) supaya TOC ringkas.
function extractTOC(md: string): Array<{ id: string; title: string }> {
  const lines = md.split("\n");
  const out: Array<{ id: string; title: string }> = [];
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const title = m[1].replace(/[*_`]/g, "").trim();
      out.push({ id: slugifyHeading(title), title });
    }
  }
  return out;
}

export default function PanduanGuruPage() {
  const md = loadPanduanMarkdown();
  const html = marked.parse(md) as string;
  const toc = extractTOC(md);

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      {/* Header — sticky, clean nav back to landing + PDF download */}
      <header className="sticky top-0 z-20 border-b border-[#e6e9ef] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              Beranda
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href="/panduan-rumah-digital-guru.pdf"
                target="_blank"
                rel="noreferrer"
                download
              >
                <Download />
                Download PDF
              </a>
            </Button>
            <Button asChild size="sm" className="bg-[#d73f45] text-white hover:bg-[#c23238]">
              <Link href="/register">Buat Website Saya</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — konteks + judul */}
      <section className="mx-auto max-w-4xl px-6 pb-8 pt-12">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700">
            <GraduationCap className="size-3" /> Panduan Lengkap
          </span>
        </div>
        <h1
          className="text-4xl font-extrabold tracking-tight text-[#172033] sm:text-5xl"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Panduan Rumah Digital Guru
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#637083]">
          Dari daftar akun, beli domain `.id`, susun konten dengan editor
          drag-and-drop, sampai publikasi ke domain Anda sendiri. Dibuat
          untuk guru Indonesia oleh PANDI × UPI.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <Search className="size-3" />
          <span>
            Tekan <kbd className="rounded border bg-slate-100 px-1 font-mono">Ctrl+F</kbd> (
            <kbd className="rounded border bg-slate-100 px-1 font-mono">⌘+F</kbd> di Mac)
            untuk cari isi panduan di halaman ini.
          </span>
        </div>
      </section>

      {/* Content — 2-column layout di desktop: TOC sidebar kiri + konten.
          Di mobile stack (TOC di atas collapsible). */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 pb-24 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav
            aria-label="Daftar isi"
            className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-[#e6e9ef] bg-white p-4 shadow-sm"
          >
            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-[#285f9e]">
              Daftar Isi
            </div>
            <ul className="space-y-1.5 text-sm">
              {toc.map((it) => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className="line-clamp-2 rounded-md px-2 py-1 text-[#4c5b70] transition-colors hover:bg-[#f4f7fb] hover:text-[#172033]"
                  >
                    {it.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <article>
          {/* Mobile TOC — details/summary supaya bisa collapse */}
          <details className="mb-6 rounded-xl border border-[#e6e9ef] bg-white p-4 shadow-sm lg:hidden">
            <summary className="cursor-pointer text-sm font-bold text-[#285f9e]">
              Daftar Isi ({toc.length} bagian)
            </summary>
            <ul className="mt-3 space-y-1.5 text-sm">
              {toc.map((it) => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className="block rounded-md px-2 py-1 text-[#4c5b70] hover:bg-[#f4f7fb] hover:text-[#172033]"
                  >
                    {it.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
          <div
            className="wb-guide prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </div>

      {/* Footer CTA — dorong ke register setelah baca panduan */}
      <section className="border-t border-[#e6e9ef] bg-white px-6 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-2xl font-extrabold text-[#172033]"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Siap mulai?
          </h2>
          <p className="mt-2 text-sm text-[#637083]">
            Bikin akun sekarang. Beli domain `.id` dari platform, semua
            langkah panduan sudah otomatis di dashboard Anda.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button asChild className="bg-[#d73f45] text-white hover:bg-[#c23238]">
              <Link href="/register">Buat Website Saya</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">Sudah punya akun? Login</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Scroll-to-top FAB — muncul saat scroll > 400px */}
      <PanduanBackToTop />
      {/* Lightbox — click screenshot → modal fullscreen + stop shimmer
          placeholder saat image done loading (data-loaded marker). */}
      <PanduanLightbox />

      {/* Inline styles untuk markdown content — mirror PDF styling supaya
          identik di web + print. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.wb-guide { color: #172033; line-height: 1.75; font-size: 1.02rem; }
.wb-guide h1 { font-family: Georgia, serif; font-size: 2rem; border-bottom: 3px solid #d73f45; padding-bottom: .4em; margin: 2.5rem 0 1rem; }
.wb-guide h1:first-of-type { margin-top: 1rem; }
.wb-guide h2 { font-family: Georgia, serif; font-size: 1.5rem; color: #285f9e; margin: 2rem 0 .75em; scroll-margin-top: 5rem; }
.wb-guide h3 { font-size: 1.15rem; color: #172033; margin: 1.5rem 0 .5em; scroll-margin-top: 5rem; }
.wb-guide p { margin: 0 0 1em; }
.wb-guide a { color: #285f9e; text-decoration: underline; text-underline-offset: 2px; }
.wb-guide code { background: #f4f7fb; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.wb-guide pre { background: #172033; color: #f4f7fb; padding: 1em 1.2em; border-radius: 8px; overflow-x: auto; font-size: 0.85em; line-height: 1.5; margin: 1.4em 0; }
.wb-guide pre code { background: none; padding: 0; color: inherit; }
.wb-guide table { border-collapse: collapse; width: 100%; margin: 1.4em 0; font-size: 0.95em; }
.wb-guide th, .wb-guide td { border: 1px solid #e6e9ef; padding: .6em .8em; text-align: left; vertical-align: top; }
.wb-guide th { background: #fbfaf7; font-weight: 700; }
.wb-guide blockquote { border-left: 3px solid #d73f45; padding: .1em 0 .1em 1.2em; margin: 1.4em 0; color: #4c5b70; font-style: italic; }
.wb-guide ul, .wb-guide ol { margin: .5em 0 1em; padding-left: 1.5em; }
.wb-guide li { margin: .35em 0; }
.wb-guide li > p { margin: 0 0 .5em; }
/* Figure wrapper — aspect-ratio placeholder cegah CLS (layout shift) saat
   image lazy-load masuk viewport. Ratio 16/10 = pas untuk screenshot
   dashboard (viewport 1440x900). Kalau image dimensi beda, auto-resize
   dalam wrapper — placeholder cuma jaga initial space. */
.wb-guide .panduan-figure {
  margin: 1.4em 0;
  aspect-ratio: 16 / 10;
  background: linear-gradient(90deg, #f4f7fb 25%, #eef2f7 50%, #f4f7fb 75%);
  background-size: 200% 100%;
  animation: panduan-shimmer 1.5s ease-in-out infinite;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e6e9ef;
  cursor: zoom-in;
}
.wb-guide .panduan-figure:has(img[data-loaded]) { animation: none; background: transparent; }
.wb-guide .panduan-figure img { display: block; width: 100%; height: 100%; object-fit: contain; box-shadow: 0 8px 24px rgba(24, 34, 53, .08); border-radius: 10px; }
@keyframes panduan-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.wb-guide hr { border: none; border-top: 1px solid #e6e9ef; margin: 2em 0; }
        `,
        }}
      />
    </div>
  );
}
