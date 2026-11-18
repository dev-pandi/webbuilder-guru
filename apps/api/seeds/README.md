# Seed konten situs

Satu folder seed = isi lengkap satu situs guru: tema, header/footer, halaman
beserta bloknya, tulisan, materi, banner, dan profil guru. Perintah
`seed-site` menerapkan folder itu ke situs yang **sudah ada**. Situs dicari
lewat domain, UUID, atau slug.

Seed bersifat *desired state*. Kalau dijalankan ulang, baris yang ada
diperbarui sesuai slug-nya, bukan diduplikasi. Gambar diunggah ke pustaka aset
situs dan dipakai ulang berdasarkan isi file, jadi menjalankan ulang tidak
menambah file baru.

## Menjalankan

Jalankan dari `apps/api`, karena perintah ini membaca `.env` yang sama dengan
API (DATABASE_URL dan konfigurasi storage):

```bash
cd apps/api

# 1. Lihat rencananya dulu. Tidak ada yang disimpan atau diunggah.
go run ./cmd/seed-site -dir seeds/mahagurux -site mahagurux.my.id -dry-run -prune

# 2. Terapkan.
go run ./cmd/seed-site -dir seeds/mahagurux -site mahagurux.my.id -prune
```

| Flag | Fungsi |
|------|--------|
| `-dir` | Folder seed (berisi `seed.json`) |
| `-site` | Domain, UUID, atau slug situs tujuan. Situs draf juga bisa. |
| `-dry-run` | Jalankan semuanya dalam transaksi lalu batalkan. Cetak rencana, termasuk daftar yang akan dihapus. |
| `-prune` | Hapus halaman/tulisan/materi/banner yang **tidak** ada di seed. Hanya berlaku untuk bagian yang diisi seed: seed tanpa banner tidak menghapus banner. Menghapus tulisan juga menghapus tanggapannya. |
| `-draft` | Halaman hanya disimpan sebagai draf editor; versi live tidak berubah. Terbitkan dari dashboard setelah dicek. |

Catatan:

- Semua perubahan database terjadi dalam satu transaksi. Kalau satu bagian
  gagal (misalnya kuota halaman terlampaui), tidak ada yang tersimpan.
- Header/footer, tema, banner, dan tulisan langsung live. Hanya halaman yang
  punya pemisahan draf/live (`-draft`).
- Renderer menyimpan cache halaman ±30 detik. Perubahan tampil setelahnya.
- Di produksi (PM2), tidak perlu restart apa pun. Cukup jalankan perintahnya.

## Struktur folder

```
seeds/<nama>/
  seed.json                       tema, header/footer, halaman, banner, profil
  tulisan/<rubrik>/<slug>.md      satu file = satu tulisan
  materi/<slug>.md                satu file = satu materi pembelajaran
  img/...                         gambar yang dirujuk dengan "./img/..."
```

Rubrik tulisan tetap enam, sesuai batasan database: `ceritaku`, `bacaanku`,
`inspirasiku`, `bangsaku`, `peradaban`, `forum-diskusi`. Nama file menjadi
slug URL, misalnya `tulisan/ceritaku/hari-pertama.md` menjadi
`/ceritaku/hari-pertama`.

## File lokal (gambar & audio)

String apa pun yang diawali `./` dan berakhiran `.png .jpg .jpeg .webp .gif
.mp3 .m4a .ogg .wav` dianggap file di dalam folder seed. File itu diunggah,
lalu string-nya diganti URL publik. Aturan ini berlaku di prop blok, `cover`
tulisan/materi, gambar banner, foto profil, dan gambar Markdown
`![alt](./img/x.webp)`.

- SVG ditolak, sama seperti upload di dashboard, karena bisa membawa script.
- Path yang keluar dari folder seed (`./../`) ditolak.
- Batas 10 MB per file, dan total ikut dihitung ke kuota penyimpanan situs.
- URL biasa (`https://...` atau `/templates/...`) dibiarkan apa adanya.

## seed.json

```json
{
  "site": {
    "name": "Nama situs (opsional)",
    "theme": { "colors": { "primary": "#173a40", "secondary": "#c4532d", "bg": "#f7f3ea", "fg": "#1f2b2e" },
               "font": { "heading": "Fraunces", "body": "Plus Jakarta Sans" }, "radius": "1.25rem" },
    "header": [ { "type": "GuruNavbar", "props": { } } ],
    "footer": [ { "type": "GuruFooter", "props": { } } ]
  },
  "profile": { "subject_or_field": "", "profile_image": "./img/avatar.webp", "bio_short": "", "bio_long": "",
               "hero_statement": "", "quote": "", "social_links": [] },
  "banners": [ { "title": "Kunci unik", "image": "./img/banner/a.webp", "href": "https://domain/halaman", "alt": "Teks alternatif" } ],
  "pages": [
    { "slug": "home", "title": "Beranda", "is_home": true,
      "seo": { "title": "", "description": "", "ogImage": "", "noindex": false },
      "blocks": [ { "type": "GuruHero", "props": { } } ] }
  ]
}
```

Hal yang perlu diingat:

- **Kunci yang salah ketik ditolak**, baik di `seed.json` maupun di front matter,
  supaya kesalahan tidak lolos diam-diam.
- **Tema**: `theme` menggantikan seluruh tema situs. Font diambil dari Google
  Fonts, jadi tulis namanya persis seperti di fonts.google.com.
- **Header/footer** disimpan sebagai layout bersama untuk semua halaman. Jangan
  taruh `GuruNavbar`/`GuruFooter` di dalam `pages[].blocks`.
- **Halaman**: kunci pencocokannya `slug`. Maksimal satu `is_home`. Halaman baru
  cukup ditambahkan ke array, lalu tautannya ditambahkan ke `links` di
  `GuruNavbar`. Blok `GuruStyles` otomatis disisipkan di awal halaman yang
  memakai blok `Guru*`.
- **Banner** dicocokkan lewat `title` (judul internal). Urutan di array menjadi
  urutan carousel. `href` wajib URL lengkap `https://`, sama seperti aturan
  dashboard.
- **Profil** disimpan di akun pemilik situs (untuk kartu direktori
  kubaca.id/guru), bukan per situs. Kalau pemilik punya situs lain, profilnya
  ikut berubah. CLI menampilkan peringatan untuk kasus ini. Field kosong tidak
  mengubah nilai yang ada.

## Front matter tulisan

```markdown
---
title: Judul Tulisan
excerpt: Ringkasan pendek untuk kartu.
date: 2026-10-30
cover: ./img/sampul/judul-tulisan.webp
tags: Aljabar, Kelas VII
reading_time: 4
status: published
comments: true
seo_title: (opsional)
seo_description: (opsional)
---

Isi Markdown...
```

Format satu baris `kunci: nilai`. Tidak perlu tanda kutip, dan titik dua di
dalam nilai aman (`title: Pecahan: Dari Martabak ke Persen`). `date` memakai
format `YYYY-MM-DD` (pukul 08.00 WIB) atau `YYYY-MM-DD HH:MM` dan menentukan
urutan "Tulisan terbaru". `reading_time` kosong berarti dihitung otomatis
(±200 kata per menit). Topik `forum-diskusi` selalu menerima tanggapan.

## Front matter materi

```markdown
---
title: Teorema Pythagoras
excerpt: ...
summary: ...
emoji: 📐
parent: geometri-dan-data
order: 1
date: 2026-09-03
cover: ./img/materi/teorema-pythagoras.webp
tags: Pythagoras, Kelas VIII
---
```

`parent` adalah slug materi induk (bab), dan hierarkinya hanya satu tingkat.
Materi induk tidak punya baris `parent`. `order` mengatur urutan di sidebar.

## Katalog blok

Prop yang tidak diisi memakai nilai bawaan. Blok `*Dynamic` mengambil data dari
database (tulisan, materi, banner), jadi isinya dikelola lewat folder
`tulisan/`, `materi/`, dan `banners`.

**Inti (tema Guru)**

| Blok | Prop utama |
|------|------------|
| `GuruNavbar` | `brandName`, `brandRole`, `brandMark` (1 huruf), `links[{label, href}]`. Taruh di `site.header`. |
| `GuruFooter` | `brandName`, `brandRole`, `brandMark`, `copyText`, `builderTitle`, `builderBrand`, `builderNote`, `links[]`, `bottomLeft`, `bottomRight`. Taruh di `site.footer`. |
| `GuruHero` | `eyebrow`, `title`, `titleEm`, `subtitle`, `ctaLabel/ctaHref`, `ctaSecondaryLabel/ctaSecondaryHref`, `image`, `imageAlt`, `stats[{value, label}]`, `noteAText/noteASub`, `noteBText/noteBSub` (+ `noteAShow:"hide"`, `noteAX/noteAY`) |
| `GuruRubricHero` | `eyebrow`, `title`, `subtitle`, `iconKey` (`book`, `bookmark`, `sparkle`, `flag`, `temple`, `chat`) |
| `GuruRubricGrid` | `eyebrow`, `title`, `subtitle`, `items[{title, desc, href, icon}]` |
| `GuruProfileCard` | `image`, `name`, `role`, `contacts[{icon, label}]`, `panels[{eyebrow, title, body}]` |
| `GuruTimeline` | `title`, `items[{date, title, desc}]` |
| `GuruTagList` | `title`, `tags[]` |
| `GuruQuote` | `text`, `author` |
| `GuruPromoCarouselDynamic` | tanpa prop. Isinya dari `banners`. |
| `GuruLatestGridDynamic` | `eyebrow`, `title`, `subtitle`. Menampilkan 4 tulisan terbaru. |
| `GuruArticleGridDynamic` | `rubric`, `sidebarTitle`, `sidebarBody`, `sidebarTags[]`, `sidebarLinks[{label, href}]` |
| `GuruLearningGridDynamic` | `sidebarTitle`, `sidebarBody`, `sidebarTags[]`, `sidebarLinks[]` |
| `GuruForumThreadListDynamic` | `moderationNote{badge, title, body}`, `participants[]`, `sidebarLinks[]` |
| `GuruStatsBarDynamic` | `eyebrow`, `title`, `subtitle`. Menampilkan total views, tanggapan, dan tulisan yang sebenarnya. |

**GuruPlus (blok tambahan)**

| Blok | Prop utama |
|------|------------|
| `GuruPlusStats` | `eyebrow`, `title`, `items[{value, suffix, label}]` |
| `GuruPlusSkillBars` | `eyebrow`, `title`, `items[{label, value 0–100, note}]` |
| `GuruPlusTimeline` | `eyebrow`, `title`, `items[{year, title, desc}]` |
| `GuruPlusFAQ` | `eyebrow`, `title`, `items[{q, a}]` |
| `GuruPlusTestimonials` | `eyebrow`, `title`, `items[{quote, author, role, avatar}]` |
| `GuruPlusStudentWall` | `eyebrow`, `title`, `items[{message, author, grade, color: amber/pink/blue/green}]` |
| `GuruPlusMarquee` | `items[]`, `speed` (`slow`/`normal`/`fast`) |
| `GuruPlusBookshelf` | `eyebrow`, `title`, `items[{title, author, year, cover, note}]` |
| `GuruPlusLessonCard` | `eyebrow`, `title`, `items[{title, level, duration, description, icon, href, ctaLabel}]` |
| `GuruPlusCertificateGrid` | `eyebrow`, `title`, `items[{title, issuer, date, image, href}]` |
| `GuruPlusAwardShowcase` | `eyebrow`, `title`, `items[{rank, title, subtitle, year, icon}]` |
| `GuruPlusContactCTA` | `variant` (`navy`/`cream`), `eyebrow`, `title`, `subtitle`, `ctaLabel/ctaHref`, `ctaSecondaryLabel/ctaSecondaryHref`, `contacts[{icon, label, value, href}]` |
| `GuruPlusBookingSlot` | `eyebrow`, `title`, `subtitle`, `slots[{day, time, status: available/booked/full, href}]`, `footerNote` |
| `GuruPlusNewsletter` | `eyebrow`, `title`, `subtitle`, `placeholder`, `buttonLabel`, `actionHref`, `disclaimer` |
| `GuruPlusStoryBlock` | `eyebrow`, `title`, `byline`, `body`, `pullquote`, `image`, `imageCaption` |
| `GuruPlusPhotoEssay` | `eyebrow`, `title`, `items[{image, caption, meta}]` |
| `GuruPlusVideoEmbed` | `eyebrow`, `title`, `items[{url, title, description, thumbnail}]` (YouTube/Vimeo) |
| `GuruPlusAudioEpisode` | `eyebrow`, `title`, `items[{title, src, duration, description, cover}]` |
| `GuruPlusBeforeAfter` | `eyebrow`, `title`, `beforeImage`, `afterImage`, `beforeLabel`, `afterLabel`, `caption` |
| `GuruPlusMapLocation` | `eyebrow`, `title`, `address`, `lat`, `lon`, `zoom`, `directionsHref`. **Belum tampil di produksi:** peta memakai iframe openstreetmap.org yang belum diizinkan CSP renderer. |

Daftar ini mengikuti `apps/renderer/components/GuruBlocks.tsx` dan
`GuruPlusBlocks.tsx`, yang menjadi acuan kalau ada perbedaan. Blok generik
lain (`Hero`, `FAQ`, `Gallery`, dan seterusnya) juga bisa dipakai. Lihat
dispatch di `apps/renderer/components/Blocks.tsx`.

## Contoh: `mahagurux`

Folder `mahagurux/` berisi situs etalase "Bu Maha", guru Matematika SMP
fiktif: 10 halaman (termasuk halaman baru `/kelas`), 18 tulisan di enam
rubrik, 9 materi dalam 3 bab, 3 banner, dan 36 ilustrasi orisinal. Footer
situs menyatakan bahwa tokoh dan ceritanya fiktif. Kalau situs ini dipakai
untuk guru sungguhan, ganti teks itu.
