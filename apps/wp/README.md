# WordPress: Rumah Digital Guru

Port tema PANDI × UPI ke WordPress. Sumber kebenaran desain + data model tetap
`apps/renderer` dan `apps/api` di branch `guru-only`.

## Tiga artefak, bukan satu plugin ber-flag

| Artefak | Lisensi | Distribusi | Isi |
|---|---|---|---|
| `theme/` | GPLv2+ | wordpress.org | Tampilan: token `--guru-*`, template |
| `plugin-basic/` | GPLv2+ | wordpress.org | Data (CPT) + 17 blok kategori `guru` |
| `plugin-pro/` | GPLv2+ | dijual sendiri | 21 blok `guru-plus` + advanced editing |

Pemisahan ini bukan preferensi, tapi syarat repo wordpress.org:

> "Plugins may not contain functionality that is restricted or locked, only to
> be made available by payment or upgrade."

> "We recommend the use of add-on plugins, hosted outside of WordPress.org, in
> order to exclude the premium code."

Konsekuensi yang mengikat:

- Paket gratis harus **nol** kode Pro. Tidak boleh kirim blok Pro dalam keadaan
  nonaktif lalu dibuka pakai license key.
- Plugin gratis **dilarang** meng-install atau meng-update plugin Pro dari
  server kita. Pemasangan Pro dilakukan manual oleh user.
- Upsell boleh, tapi kontekstual atau hanya di halaman setting.

## Kenapa CPT di plugin, bukan di theme

Kalau CPT didaftarkan dari theme, guru yang berganti theme kehilangan seluruh
artikel dan materinya — konten jadi sandera tampilan. Plugin Basic memegang
data; theme hanya merender.

## Lisensi habis ≠ situs rusak

Kode yang memakai WP API adalah turunan GPL, jadi redistribusi Pro tidak bisa
dilarang. Yang dijual adalah update otomatis + support. Karena itu lisensi
kedaluwarsa **tidak** mematikan blok Pro: situs guru yang sudah live tidak boleh
rusak gara-gara telat bayar, dan penguncian semacam itu toh bisa dilucuti.

## Kontrak URL

Dijaga sama dengan renderer supaya guru yang pindah dari kubaca.id ke
WordPress tidak kehilangan alamat artikelnya — tautan lama dan hasil
pencarian tetap mengarah ke tempat yang benar.

| Pola | Isi |
|---|---|
| `/{rubrik}` | Arsip rubrik |
| `/{rubrik}/page/{n}` | Arsip berhalaman |
| `/{rubrik}/{slug}` | Detail artikel |
| `/pembelajaran` | Arsip materi ajar |

`{rubrik}` dibatasi 6 nilai tetap: `ceritaku`, `bacaanku`, `inspirasiku`,
`bangsaku`, `peradaban`, `forum-diskusi`.

Aturan ini **tidak** memakai argumen `rewrite` bawaan, karena core mengganti
slug taxonomy kosong dengan nama taxonomy (`/rubrik/ceritaku`), bukan
`/ceritaku`:

```php
if ( empty( $args['rewrite']['slug'] ) ) {
    $args['rewrite']['slug'] = sanitize_title_with_dashes( $this->name );
}
```

Regex memakai daftar rubrik eksplisit, bukan `([^/]+)`, supaya URL satu segmen
lain tidak tertangkap. Sudah diuji terisolasi: `/tentang-kami`,
`/pembelajaran`, `/blog/2026/judul`, `/ceritakuXX` semuanya tidak cocok.

### Status verifikasi

Diuji di WordPress 6.7 + MariaDB 10.11 (Docker), plugin di-bind-mount langsung
dari repo. Hasil:

| Uji | Hasil |
|---|---|
| CPT `guru_article`, `guru_materi`, `guru_banner` terdaftar | lolos |
| 6 rubrik ter-seed, idempoten | lolos |
| Permalink artikel = `/{rubrik}/{slug}` | lolos |
| `/{rubrik}/{slug}` resolve 200 | lolos |
| `/{rubrik}` arsip resolve 200 | lolos |
| `/tentang-kami` tetap 404 (tidak tertelan aturan rubrik) | lolos |
| Rubrik buatan guru di luar 6 baku | lolos setelah diperbaiki |

**Trailing slash — opsional, bukan syarat.** Struktur `/%postname%` membuat
URL identik dengan renderer; default WP `/%postname%/` menghasilkan
`/forum-diskusi/judul/`. Keduanya berfungsi: tautan lama tanpa slash tetap
sampai lewat 301 bawaan WordPress, yang aman untuk pembaca maupun SEO.
Pilih `/%postname%` hanya kalau ingin alamatnya benar-benar sama persis.

## Theme

`theme/` — block theme (FSE). Hanya tampilan; data ada di plugin.

```
theme/
  style.css             header tema + catatan
  theme.json            palet 4 warna + tipografi + layout
  functions.php         enqueue guru.css (frontend + editor)
  assets/guru.css       gaya blok Guru, disalin dari exports/guru_css.go
  parts/                header, footer
  templates/            index, single-guru_article, taxonomy-rubrik,
                        archive-guru_materi
```

### Empat warna, tujuh belas token

Di renderer, 17 variabel `--guru-*` diturunkan dari 4 warna tema user lewat
`color-mix()`. Pola itu dipertahankan: `theme.json` mengekspos 4 warna saja
(`primary`, `secondary`, `bg`, `fg`) ke Site Editor, dan `guru.css` menurunkan
sisanya:

```css
--guru-navy: var(--wp--preset--color--primary);
--guru-muted: color-mix(in srgb, var(--wp--preset--color--fg) 55%, var(--wp--preset--color--bg));
```

Jadi guru cukup mengganti empat warna dan seluruh tema ikut — sama seperti di
kubaca.id, tanpa menyentuh CSS.

Default palet = nilai template `guru-pandi-upi`: `#14233b`, `#b6423d`,
`#fbf8f1`, `#263247`.

### Status

Diuji di WP 6.7: tema aktif tanpa error PHP, `guru.css` ter-enqueue dan
terambil 200, keempat preset warna ter-emit dengan nilai PANDI × UPI, dan
`guru.css` memang mereferensikan preset itu. Semua 17 token terdefinisi, tidak
ada yang dipakai tanpa definisi.

**Belum**: template masih memakai core block (post-title, post-content, query).
Tampilan khas PANDI × UPI — hero, navbar, article grid, promo carousel —
datang dari 17 blok `Guru*` yang belum di-port. Jadi tema ini kerangka yang
benar dengan token warna yang benar, belum wajah akhirnya.
